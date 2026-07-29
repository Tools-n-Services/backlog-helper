/**
 * Отправка писем.
 *
 * Портал обратной связи держится на письмах: без них человек не узнает,
 * что его обращение взяли в работу, и не вернётся. Поэтому канал доставки —
 * не деталь инфраструктуры, а часть продукта.
 *
 * Пять каналов, и каждый решает свою задачу:
 *
 *   smtp      — настоящая доставка через сервер организации. Основной путь:
 *               SMTP есть у Яндекс 360, Mail.ru для бизнеса, корпоративного
 *               Exchange, а также у SES и Mailgun, то есть выбор поставщика
 *               не требует правок кода;
 *   unisender — Unisender Go: российский сервис рассылки. Оплата в рублях
 *               и репутация отправителя, известная Яндексу и Mail.ru;
 *   resend    — доставка через HTTP-API, когда SMTP закрыт наружу;
 *   file      — локальный ящик в `.data/mail`. Полноценный канал, а не пропуск
 *               отправки: без него вход по ссылке нельзя ни попробовать
 *               на свежем клоне, ни проверить сценарным тестом, потому что
 *               ссылка приходит только письмом;
 *   log       — то же самое в консоль, когда файлы не нужны.
 *
 * Разница между SMTP и HTTP-API не в надёжности, а в том, что закрыто
 * в сети развёртывания: порт 587 наружу закрывают чаще, чем 443.
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

export type MailProvider = 'smtp' | 'unisender' | 'resend' | 'file' | 'log'

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
      case 'unisender':
        return await sendViaUnisender(letter)
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
    return { ok: false, error: describeError(error) }
  }
}

/**
 * Человекочитаемая причина сбоя.
 *
 * `fetch` в Node на недоступный узел бросает ровно «fetch failed», а всё
 * содержательное — отказ соединения, неизвестное имя, обрыв TLS — прячет
 * в `cause`. Без разворачивания цепочки в журнале остаётся строка, по которой
 * невозможно отличить закрытый файрволом порт от опечатки в адресе.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts: string[] = [error.message]
  let cause: unknown = error.cause
  /* Цепочка причин бывает длиннее одного звена; ограничиваем, чтобы
     зацикленная ссылка не превратилась в бесконечный текст. */
  for (let depth = 0; cause instanceof Error && depth < 3; depth++) {
    const code = (cause as { code?: string }).code
    parts.push(code ? `${cause.message} (${code})` : cause.message)
    cause = cause.cause
  }

  return parts.join(': ')
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

/* ────────────────────────── Unisender Go ─────────────────────────── */

/**
 * Российский сервис рассылки транзакционных писем.
 *
 * Отличается от Resend не возможностями, а тем, что для портала с русскими
 * пользователями решает исход: оплата в рублях без зарубежной карты
 * и репутация отправителя, которую Яндекс и Mail.ru знают.
 *
 * Адрес вынесен в переменную не для тестов, а потому что у сервиса две
 * площадки — российская и европейская, и выбор между ними это вопрос того,
 * где по договору лежат персональные данные, а не настройка кода.
 */
const UNISENDER_URL = 'https://go1.unisender.ru/ru/transactional/api/v1/email/send.json'

export interface Sender {
  email: string
  name: string | null
}

/**
 * Разбор адреса отправителя на имя и почту.
 *
 * SMTP и Resend принимают `Имя <адрес>` как есть, а Unisender Go требует
 * два поля раздельно. Разбор здесь, а не две переменные окружения на то же
 * самое: одна настройка, которая работает для всех каналов, честнее двух,
 * которые обязаны совпадать.
 */
export function parseSender(address: string = senderAddress()): Sender {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address)
  if (!match) return { email: address.trim(), name: null }

  return {
    email: match[2]!.trim(),
    /* Имя в кавычках — допустимая форма заголовка, кавычки в поле не нужны. */
    name: match[1]!.replace(/^"|"$/g, '').trim() || null,
  }
}

interface UnisenderResponse {
  status?: string
  code?: number
  message?: string
  /** Адреса, которые сервис не принял: причина по каждому. */
  failed_emails?: Record<string, string>
}

async function sendViaUnisender(letter: Letter): Promise<SendResult> {
  const key = process.env.UNISENDER_API_KEY
  if (!key) {
    return { ok: false, error: 'MAIL_PROVIDER=unisender, но UNISENDER_API_KEY не задан' }
  }
  /* Ключ уходит HTTP-заголовком, а заголовки допускают только latin1.
     Проверка не теоретическая: на русской раскладке «с» и «c», «е» и «e»
     неотличимы на глаз, и одна такая буква в ключе даёт ошибку про
     ByteString и код 255 — по ней причину не угадать никогда. */
  if (!/^[\x20-\x7E]+$/.test(key)) {
    return {
      ok: false,
      error: 'UNISENDER_API_KEY содержит символы вне latin1 — вероятно, кириллица в ключе',
    }
  }

  const url = process.env.UNISENDER_API_URL?.trim() || UNISENDER_URL
  const sender = parseSender()

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        recipients: [{ email: letter.to }],
        subject: letter.subject,
        body: { plaintext: letter.text },
        from_email: sender.email,
        ...(sender.name ? { from_name: sender.name } : {}),
        /* Сервис по умолчанию дописывает свою ссылку отписки. Портал ставит
           свою — там, где она уместна, и не ставит в письме со ссылкой входа,
           от которого отписаться нельзя по смыслу. Отключение требует
           разрешения поддержки сервиса, поэтому это выбор владельца портала,
           а не наше умолчание. */
        ...(isTrue(process.env.UNISENDER_SKIP_UNSUBSCRIBE) ? { skip_unsubscribe: 1 } : {}),
      },
    }),
  })

  const body = (await response.json().catch(() => null)) as UnisenderResponse | null

  if (!response.ok) {
    /* Сообщение сервиса важнее кода ответа: «превышен лимит» и «домен
       не подтверждён» приходят одним и тем же 400. */
    const detail = body?.message ?? (await response.text().catch(() => ''))
    return {
      ok: false,
      error: `Unisender ответил ${response.status}${detail ? `: ${detail}` : ''}`,
    }
  }

  if (body?.status && body.status !== 'success') {
    return {
      ok: false,
      error: `Unisender: ${body.message ?? body.status}${body.code ? ` (код ${body.code})` : ''}`,
    }
  }

  /* Приём запроса и приём адреса — разные вещи. Ответ 200 с непустым
     failed_emails означает, что письмо не ушло, и считать это успехом
     значит потерять его молча: повтора не будет. */
  const failed = Object.entries(body?.failed_emails ?? {})
  if (failed.length > 0) {
    return {
      ok: false,
      error: `Unisender отверг адрес: ${failed.map(([to, why]) => `${to} — ${why}`).join('; ')}`,
    }
  }

  return { ok: true }
}

function isTrue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

/* ──────────────────────────────- Resend ──────────────────────────── */

const RESEND_URL = 'https://api.resend.com/emails'

interface ResendResponse {
  id?: string
  /** Текст отказа: «domain is not verified», «you can only send to…». */
  message?: string
  name?: string
}

async function sendViaResend(letter: Letter): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return { ok: false, error: 'MAIL_PROVIDER=resend, но RESEND_API_KEY не задан' }
  }
  /* Как и у Unisender: ключ уходит заголовком, а заголовки — latin1. */
  if (!/^[\x20-\x7E]+$/.test(key)) {
    return {
      ok: false,
      error: 'RESEND_API_KEY содержит символы вне latin1 — вероятно, кириллица в ключе',
    }
  }

  /* Через HTTP-API напрямую, без клиентской библиотеки: один POST
     не стоит ещё одной зависимости, которую придётся обновлять. */
  const response = await fetch(process.env.RESEND_API_URL?.trim() || RESEND_URL, {
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

  const body = (await response.json().catch(() => null)) as ResendResponse | null

  if (!response.ok) {
    /* Сообщение сервиса важнее кода: «домен не подтверждён» и «на этот адрес
       отправлять нельзя» приходят одним и тем же 403, а различать их
       владельцу портала приходится в первую очередь. */
    return {
      ok: false,
      error: `Resend ответил ${response.status}${body?.message ? `: ${body.message}` : ''}`,
    }
  }

  /* Успех без идентификатора письма — не успех: значит ответ пришёл
     не от Resend, а от чего-то на его месте (прокси, заглушка). */
  if (!body?.id) {
    return { ok: false, error: 'Resend не вернул идентификатор письма' }
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
