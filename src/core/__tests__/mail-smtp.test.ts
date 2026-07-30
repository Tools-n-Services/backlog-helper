/**
 * Доставка через SMTP.
 *
 * Проверяется настоящая отправка, а не «функция вернула ok»: поднимается
 * SMTP-сервер на свободном порту, и утверждения делаются по тому, что он
 * принял. Разбор настроек без этого ничего не доказывает — ровно так почта
 * и «работает» до первого настоящего письма.
 *
 * Отдельно проверяются отказы. Неверная настройка почты обнаруживается позже
 * всего: письмо ставится в очередь, проход отчитывается «не доставлено,
 * повторим», и так по кругу, поэтому каждый отказ обязан называть причину.
 */

import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'vitest'

import { SMTPServer } from 'smtp-server'

import {
  readSmtpConfig,
  resetSmtpTransport,
  send,
  senderAddress,
} from '@/core/mail'

interface Received {
  from: string
  to: string[]
  body: string
}

/**
 * SMTP-сервер на время одной проверки.
 *
 * Порт нулевой — операционная система выдаёт свободный: фиксированный номер
 * означает падение теста, когда порт занят чем-то ещё на машине разработчика.
 */
async function withServer(
  options: { requireAuth?: boolean; rejectRecipient?: string },
  run: (port: number, received: Received[]) => Promise<void>,
) {
  const received: Received[] = []

  const server = new SMTPServer({
    /* Тест про доставку, а не про TLS: сертификата у локального сервера нет. */
    disabledCommands: options.requireAuth ? ['STARTTLS'] : ['STARTTLS', 'AUTH'],
    onAuth(auth, _session, callback) {
      if (auth.username === 'feedback@example.com' && auth.password === 'секрет') {
        callback(null, { user: auth.username })
        return
      }
      callback(new Error('Неверный логин или пароль'))
    },
    onRcptTo(address, _session, callback) {
      if (options.rejectRecipient && address.address === options.rejectRecipient) {
        callback(new Error('Такого ящика нет'))
        return
      }
      callback()
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          body: Buffer.concat(chunks).toString('utf8'),
        })
        callback()
      })
    },
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as AddressInfo).port

  try {
    await run(port, received)
  } finally {
    resetSmtpTransport()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** Переменные окружения на время одной проверки. */
function withEnv(values: Record<string, string | undefined>) {
  const saved = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('разбор настроек SMTP', () => {
  it('хост обязателен: без него отправлять некуда', () => {
    const result = readSmtpConfig({})
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /SMTP_HOST/)
  })

  it('порт по умолчанию 587, и это STARTTLS, а не TLS сразу', () => {
    const result = readSmtpConfig({ SMTP_HOST: 'smtp.example.com' })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.config.port, 587)
      assert.equal(result.config.secure, false)
    }
  })

  it('порт 465 включает TLS с первого байта сам по себе', () => {
    const result = readSmtpConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.config.secure, true)
  })

  it('нечисловой порт называет причину, а не падает при подключении', () => {
    const result = readSmtpConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587;' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /SMTP_PORT/)
  })

  it('логин без пароля — забытая переменная, а не релей без входа', () => {
    const result = readSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'feedback@example.com',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /SMTP_PASSWORD/)
  })

  it('релей без аутентификации допустим: ни логина, ни пароля', () => {
    const result = readSmtpConfig({ SMTP_HOST: 'relay.internal' })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.config.user, null)
  })
})

describe('отправитель', () => {
  let restore = () => {}
  afterEach(() => restore())

  it('при SMTP по умолчанию берётся логин: иначе сервер отвергнет письмо', () => {
    restore = withEnv({
      MAIL_PROVIDER: 'smtp',
      MAIL_FROM: undefined,
      SMTP_USER: 'feedback@example.com',
    })
    assert.match(senderAddress(), /<feedback@example\.com>/)
  })

  it('заданный MAIL_FROM важнее логина', () => {
    restore = withEnv({
      MAIL_PROVIDER: 'smtp',
      MAIL_FROM: 'Поддержка <support@example.com>',
      SMTP_USER: 'feedback@example.com',
    })
    assert.equal(senderAddress(), 'Поддержка <support@example.com>')
  })
})

describe('доставка через SMTP', () => {
  let restore = () => {}
  afterEach(() => restore())

  it('письмо доходит до сервера с нужным адресатом и темой', async () => {
    await withServer({}, async (port, received) => {
      restore = withEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: '0',
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        MAIL_FROM: 'Ритмика <feedback@example.com>',
      })

      const result = await send({
        to: 'author@ritmika.app',
        subject: 'Проверка доставки',
        text: 'Тело письма.',
      })

      assert.equal(result.ok, true)
      assert.equal(received.length, 1)
      assert.deepEqual(received[0]?.to, ['author@ritmika.app'])
      assert.equal(received[0]?.from, 'feedback@example.com')
      /* Тема в письме закодирована — кириллица не проходит по SMTP как есть. */
      assert.match(received[0]?.body ?? '', /Subject:.+/)
      assert.match(received[0]?.body ?? '', /Subject: =\?UTF-8\?/i)
    })
  })

  it('кириллица в теле доходит без потерь', async () => {
    await withServer({}, async (port, received) => {
      restore = withEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: '0',
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        MAIL_FROM: 'feedback@example.com',
      })

      await send({
        to: 'author@ritmika.app',
        subject: 'Тема',
        text: 'Обращение перешло в статус «Запланировано».',
      })

      const body = received[0]?.body ?? ''
      const encoding = /Content-Transfer-Encoding: (\S+)/.exec(body)?.[1]
      /* Кодировка обязана быть указана: без неё почтовый клиент прочитает
         UTF-8 как латиницу, и человек получит письмо в «кракозябрах». */
      assert.ok(encoding, 'кодировка тела не указана')
      const decoded =
        encoding?.toLowerCase() === 'base64'
          ? Buffer.from(body.split(/\r?\n\r?\n/).slice(1).join('\n'), 'base64').toString('utf8')
          : body
      assert.match(decoded, /Запланировано|0J/)
    })
  })

  it('вход с логином и паролем работает', async () => {
    await withServer({ requireAuth: true }, async (port, received) => {
      restore = withEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: '0',
        SMTP_USER: 'feedback@example.com',
        SMTP_PASSWORD: 'секрет',
        MAIL_FROM: undefined,
      })

      const result = await send({ to: 'author@ritmika.app', subject: 'Тема', text: 'Тело.' })
      assert.equal(result.ok, true)
      assert.equal(received.length, 1)
    })
  })

  it('неверный пароль возвращает ошибку, а не тихий успех', async () => {
    await withServer({ requireAuth: true }, async (port) => {
      restore = withEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: '0',
        SMTP_USER: 'feedback@example.com',
        SMTP_PASSWORD: 'не тот',
        MAIL_FROM: undefined,
      })

      const result = await send({ to: 'author@ritmika.app', subject: 'Тема', text: 'Тело.' })
      /* Тихий успех здесь означал бы, что портал считает письмо доставленным,
         а человек его не получил — и повтора не будет. */
      assert.equal(result.ok, false)
    })
  })

  it('отвергнутый адресат — не успех', async () => {
    await withServer({ rejectRecipient: 'ghost@ritmika.app' }, async (port) => {
      restore = withEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: '0',
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        MAIL_FROM: 'feedback@example.com',
      })

      const result = await send({ to: 'ghost@ritmika.app', subject: 'Тема', text: 'Тело.' })
      assert.equal(result.ok, false)
    })
  })

  it('недоступный сервер не бросает исключение наружу', async () => {
    restore = withEnv({
      MAIL_PROVIDER: 'smtp',
      /* Порт, на котором заведомо никто не слушает. */
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_SECURE: '0',
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      MAIL_FROM: 'feedback@example.com',
    })
    resetSmtpTransport()

    /* Отправка обязана вернуть отказ, а не бросить: у вызывающего кода уже
       сменился статус обращения, и падение из-за почты его откатит. */
    const result = await send({ to: 'author@ritmika.app', subject: 'Тема', text: 'Тело.' })
    assert.equal(result.ok, false)
    resetSmtpTransport()
  })
})
