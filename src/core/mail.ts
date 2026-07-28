/**
 * Отправка писем.
 *
 * Портал обратной связи держится на письмах: без них человек не узнает,
 * что его обращение взяли в работу, и не вернётся. Поэтому канал доставки —
 * не деталь инфраструктуры, а часть продукта.
 *
 * Три канала, и каждый решает свою задачу:
 *
 *   resend — настоящая доставка;
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

import { product } from '@config/product'

export interface Letter {
  to: string
  subject: string
  text: string
}

export type MailProvider = 'resend' | 'file' | 'log'

const provider = (process.env.MAIL_PROVIDER ?? 'file') as MailProvider

/** Куда складывает письма файловый ящик. */
export const MAIL_DIR = path.join(process.cwd(), '.data', 'mail')

const from = process.env.MAIL_FROM ?? `${product.name} <no-reply@${product.domain}>`

export type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Отправляет письмо.
 *
 * Не бросает исключение: у вызывающего кода почти всегда есть что-то
 * поважнее письма — статус обращения уже сменился, сессия уже открыта.
 * Решение о повторе принимает тот, кто ставил письмо в очередь.
 */
export async function send(letter: Letter): Promise<SendResult> {
  try {
    switch (provider) {
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
      from,
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
    JSON.stringify({ ...letter, from, sentAt: new Date().toISOString() }, null, 2),
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
