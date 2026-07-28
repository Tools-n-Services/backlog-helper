/**
 * Отправка писем.
 *
 * Портал обратной связи держится на письмах: без них человек не узнает,
 * что его обращение взяли в работу, и не вернётся. Поэтому канал доставки —
 * не деталь инфраструктуры, а часть продукта.
 *
 * Четыре канала, и каждый решает свою задачу:
 *
 *   smtp   — настоящая доставка через сервер организации. Основной путь:
 *            SMTP есть у Яндекс 360, Mail.ru для бизнеса, корпоративного
 *            Exchange, а также у SES и Mailgun, то есть выбор поставщика
 *            не требует правок кода;
 *   resend — настоящая доставка через HTTP-API, когда SMTP закрыт наружу;
 *   file   — локальный ящик в `.data/mail`. Полноценный канал, а не пропуск
 *            отправки: без него вход по ссылке нельзя ни попробовать
 *            на свежем клоне, ни проверить сценарным тестом, потому что
 *            ссылка приходит только письмом;
 *   log    — то же самое в консоль, когда файлы не нужны.
 *
 * Выбор — переменной `MAIL_PROVIDER`. Умолчание `file`: на машине
 * разработчика ключей от почтового сервиса нет, и молча не отправить
 * письмо хуже, чем отправить его в папку.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import nodemailer, { type Transporter } from 'nodemailer'

import { product } from '@config/product'

export interface Letter {
  to: string
  subject: string
  text: string
}

export type MailProvider = 'smtp' | 'resend' | 'file' | 'log'

/**
 * Настройки читаются при отправке, а не при импорте модуля.
 *
 * Разница существенная: скрипты подгружают `.env` сами, и при чтении на этапе
 * импорта канал зависел бы от порядка импортов в вызывающем файле. Порядок
 * импортов — не то, на что стоит опираться, и ломается он молча: письма
 * уходят не туда, куда написано в настройках.
 */
export function mailProvider(): MailProvider {
  return (process.env.MAIL_PROVIDER?.trim() || 'file') as MailProvider
}

/** Куда складывает письма файловый ящик. */
export const MAIL_DIR = path.join(process.cwd(), '.data', 'mail')

/**
 * Адрес отправителя.
 *
 * При SMTP умолчание — сам логин: почтовые серверы отвергают письмо, в котором
 * `From` не совпадает с ящиком, от имени которого подключились. Умолчание
 * `no-reply@` на чужом домене здесь дало бы отказ на каждом письме, причём
 * с формулировкой про политику отправителя, по которой причину не угадать.
 */
export function senderAddress(): string {
  const explicit = process.env.MAIL_FROM?.trim()
  if (explicit) return explicit

  const user = process.env.SMTP_USER?.trim()
  if (mailProvider() === 'smtp' && user) return `${product.name} <${user}>`

  return `${product.name} <no-reply@${product.domain}>`
}

export type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Отправляет письмо.
 *
 * Не бросает исключение: у вызывающего кода почти всегда есть что-то
 * поважнее письма — статус обращения уже сменился, сессия уже открыта.
 * Решение о повторе принимает тот, кто ставил письмо в очередь.
 */
export async function send(letter: Letter): Promise<SendResult> {
  const provider = mailProvider()
  try {
    switch (provider) {
      case 'smtp':
        return await sendViaSmtp(letter)
      case 'resend':
        return await sendViaResend(letter)
      case 'log':
        return sendToConsole(letter)
      case 'file':
        return await sendToFile(letter)
      default:
        return { ok: false, error: `Неизвестный MAIL_PROVIDER: ${provider}` }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/* ─────────────────────────────── SMTP ─────────────────────────────── */

export interface SmtpConfig {
  host: string
  port: number
  /** TLS с первого байта. На 465 — да, на 587 подключение поднимается STARTTLS. */
  secure: boolean
  user: string | null
  password: string | null
}

export type SmtpConfigResult =
  | { ok: true; config: SmtpConfig }
  | { ok: false; error: string }

/**
 * Разбор настроек SMTP.
 *
 * Вынесено отдельно, потому что неверная настройка почты обнаруживается
 * позже всего: письмо ставится в очередь, проход отчитывается «не доставлено,
 * повторим», и так по кругу. Проверка настроек до первой отправки — то,
 * что превращает эту тишину в понятную ошибку.
 *
 * Пароль необязателен: у внутреннего релея аутентификации может не быть
 * вовсе. Хост обязателен всегда — без него отправлять некуда.
 */
export function readSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfigResult {
  const host = env.SMTP_HOST?.trim()
  if (!host) {
    return { ok: false, error: 'MAIL_PROVIDER=smtp, но SMTP_HOST не задан' }
  }

  const rawPort = env.SMTP_PORT?.trim()
  /* 587 — умолчание не по традиции, а потому что это порт отправки
     с STARTTLS: именно его отдают Яндекс 360 и Mail.ru для бизнеса. */
  const port = rawPort ? Number(rawPort) : 587
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `SMTP_PORT должен быть числом от 1 до 65535, а не «${rawPort}»` }
  }

  const rawSecure = env.SMTP_SECURE?.trim().toLowerCase()
  const secure = rawSecure ? rawSecure === '1' || rawSecure === 'true' : port === 465

  const user = env.SMTP_USER?.trim() || null
  const password = env.SMTP_PASSWORD ?? null

  /* Логин без пароля — почти всегда забытая переменная, а не релей
     без аутентификации: там не задают и логин. */
  if (user && !password) {
    return { ok: false, error: 'SMTP_USER задан, а SMTP_PASSWORD пуст' }
  }

  return { ok: true, config: { host, port, secure, user, password } }
}

/**
 * Соединение переиспользуется между письмами.
 *
 * Рассылка идёт пачками — за один проход уходит несколько десятков писем,
 * и поднимать TLS-сессию на каждое значит и медленно, и подозрительно
 * для самого сервера: серия одиночных подключений выглядит как рассылка
 * спама и ловит ограничение по частоте.
 */
let transport: Transporter | null = null

function smtpTransport(config: SmtpConfig): Transporter {
  transport ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
    pool: true,
    maxConnections: 3,
  })
  return transport
}

/** Сбрасывает соединение. Нужен тестам и смене настроек на ходу. */
export function resetSmtpTransport() {
  transport?.close()
  transport = null
}

async function sendViaSmtp(letter: Letter): Promise<SendResult> {
  const parsed = readSmtpConfig()
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const info = await smtpTransport(parsed.config).sendMail({
    from: senderAddress(),
    to: letter.to,
    subject: letter.subject,
    text: letter.text,
  })

  /* Сервер принял письмо, но отверг часть адресов — это не успех.
     Молчаливое «ok» здесь означало бы, что человек не получил письмо,
     а портал считает, что получил. */
  if (info.rejected?.length) {
    return { ok: false, error: `Сервер отверг адрес: ${info.rejected.join(', ')}` }
  }
  return { ok: true }
}

async function sendViaResend(letter: Letter): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return { ok: false, error: 'MAIL_PROVIDER=resend, но RESEND_API_KEY не задан' }
  }

  /* Через HTTP-API напрямую, без клиентской библиотеки: один POST
     не стоит ещё одной зависимости, которую придётся обновлять. */
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: senderAddress(),
      to: [letter.to],
      subject: letter.subject,
      text: letter.text,
    }),
  })

  if (!response.ok) {
    return { ok: false, error: `Resend ответил ${response.status}: ${await response.text()}` }
  }
  return { ok: true }
}

function sendToConsole(letter: Letter): SendResult {
  console.info(
    `\n── письмо ──────────────────────────────────────────────\n` +
      `кому:  ${letter.to}\n` +
      `тема:  ${letter.subject}\n\n${letter.text}\n` +
      `────────────────────────────────────────────────────────\n`,
  )
  return { ok: true }
}

/**
 * Локальный ящик.
 *
 * Имя файла начинается с времени в миллисекундах — так последнее письмо
 * находится сортировкой по имени, без чтения содержимого.
 */
async function sendToFile(letter: Letter): Promise<SendResult> {
  await mkdir(MAIL_DIR, { recursive: true })
  const stamp = Date.now().toString().padStart(14, '0')
  const safe = letter.to.replace(/[^a-z0-9._-]/gi, '_')
  const file = path.join(MAIL_DIR, `${stamp}-${safe}.json`)

  await writeFile(
    file,
    JSON.stringify({ ...letter, from: senderAddress(), sentAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
  /* Дублируем в консоль: разработчик чаще смотрит в терминал, чем в папку. */
  sendToConsole(letter)
  return { ok: true }
}

/* ─────────────────────────── Письма ───────────────────────────── */

/** Ссылка входа (FR-172). */
export async function deliverSignInLink(to: string, url: string): Promise<SendResult> {
  return send({
    to,
    subject: `Вход в ${product.name}`,
    text:
      `Ссылка для входа — действует 15 минут и открывается один раз:\n\n${url}\n\n` +
      'Если вход запрашивали не вы, письмо можно проигнорировать: без перехода по ссылке ничего не произойдёт.',
  })
}

export interface StatusLetter {
  to: string
  postTitle: string
  postUrl: string
  statusName: string
  /** Комментарий команды к переходу. Именно он и делает письмо нужным. */
  note: string | null
  unsubscribeUrl: string
}

/**
 * Смена статуса обращения (FR-301).
 *
 * Письмо без объяснения — «статус изменился на „Не будем делать“» — хуже
 * молчания: человек узнаёт отказ и не узнаёт причину. Поэтому текст решения
 * идёт в тело письма, а не остаётся в админке.
 */
export interface ReplyLetter {
  to: string
  postTitle: string
  postUrl: string
  authorName: string
  body: string
  /** Ответ на комментарий, а не на само обращение. */
  isReplyToComment: boolean
  unsubscribeUrl: string
}

/**
 * Ответ в обсуждении (FR-302).
 *
 * Текст ответа идёт в письмо целиком, а не заменяется на «вам ответили».
 * Человек, задавший вопрос, чаще всего получает короткий ответ — и заставлять
 * его открывать портал ради двух строк значит терять половину обсуждений
 * на полпути.
 */
export async function deliverReply(letter: ReplyLetter): Promise<SendResult> {
  const what = letter.isReplyToComment
    ? `${letter.authorName} ответил на ваш комментарий`
    : `${letter.authorName} ответил в обсуждении вашего обращения`

  return send({
    to: letter.to,
    subject: `${letter.postTitle} — новый ответ`,
    text: [
      `${what} «${letter.postTitle}»:`,
      letter.body,
      letter.postUrl,
      `\nОтписаться от обновлений этого обращения: ${letter.unsubscribeUrl}`,
    ].join('\n\n'),
  })
}

export interface NeedsInfoLetter {
  to: string
  postTitle: string
  postUrl: string
  /** Вопрос команды. Без него напоминание бессмысленно. */
  question: string | null
  daysLeft: number
}

/**
 * Напоминание автору, что ждут его ответа (FR-533).
 *
 * Вопрос повторяется в письме целиком: человек, которому написали неделю
 * назад, не помнит, о чём именно спрашивали, и «ответьте на портале»
 * заставляет его сначала вспоминать, а потом искать.
 */
export async function deliverNeedsInfoReminder(
  letter: NeedsInfoLetter,
): Promise<SendResult> {
  const days = letter.daysLeft
  const word = days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'

  return send({
    to: letter.to,
    subject: `${letter.postTitle} — ждём вашего ответа`,
    text: [
      `По обращению «${letter.postTitle}» команда просила уточнить детали.`,
      letter.question ? `Вопрос:\n${letter.question}` : null,
      `Ответить можно в обсуждении: ${letter.postUrl}`,
      `Если ответа не будет, через ${days} ${word} обращение закроется. ` +
        'Это не окончательно: ответ в обсуждении открывает его заново.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  })
}

export async function deliverStatusChange(letter: StatusLetter): Promise<SendResult> {
  const body = [
    `Обращение «${letter.postTitle}» перешло в статус «${letter.statusName}».`,
    letter.note,
    letter.postUrl,
    `\nОтписаться от обновлений этого обращения: ${letter.unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return send({
    to: letter.to,
    subject: `${letter.postTitle} — ${letter.statusName}`,
    text: body,
  })
}
