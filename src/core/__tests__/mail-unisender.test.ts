/**
 * Доставка через Unisender Go.
 *
 * Ключа от сервиса в тестах нет и быть не должно, поэтому поднимается
 * локальный HTTP-стенд и проверяется то, что вообще можно проверить без
 * настоящего аккаунта: форма запроса и разбор всех ответов. Именно здесь
 * ошибки и живут — у сервиса три разных способа сказать «письмо не ушло»,
 * и два из них приходят с кодом 200.
 */

import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'vitest'

import { parseSender, send } from '@/core/mail'

interface Captured {
  path: string
  apiKey: string | undefined
  body: {
    message?: {
      recipients?: { email: string }[]
      subject?: string
      body?: { plaintext?: string }
      from_email?: string
      from_name?: string
      skip_unsubscribe?: number
    }
  }
}

/** Ответ стенда на один запрос. */
interface Reply {
  status?: number
  json?: unknown
  /** Оборвать соединение, не ответив: сеть тоже отказывает. */
  hangUp?: boolean
}

async function withStand(
  reply: Reply,
  run: (captured: Captured[]) => Promise<void>,
): Promise<void> {
  const captured: Captured[] = []

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      captured.push({
        path: request.url ?? '',
        apiKey: request.headers['x-api-key'] as string | undefined,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
      })

      if (reply.hangUp) {
        request.socket.destroy()
        return
      }
      response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(reply.json ?? { status: 'success' }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const saved = { ...process.env }
  process.env.MAIL_PROVIDER = 'unisender'
  process.env.UNISENDER_API_KEY = 'test-key-0123456789'
  process.env.UNISENDER_API_URL = `http://127.0.0.1:${port}/ru/transactional/api/v1/email/send.json`
  process.env.MAIL_FROM = 'Ритмика <feedback@example.com>'
  delete process.env.UNISENDER_SKIP_UNSUBSCRIBE

  try {
    await run(captured)
  } finally {
    process.env = saved
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** Порт, на котором заведомо никто не слушает. */
async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

const letter = {
  to: 'author@ritmika.app',
  subject: 'Обращение перешло в статус «Запланировано»',
  text: 'Тело письма с кириллицей.',
}

describe('разбор адреса отправителя', () => {
  it('делит «Имя <адрес>» на два поля', () => {
    assert.deepEqual(parseSender('Ритмика <feedback@example.com>'), {
      email: 'feedback@example.com',
      name: 'Ритмика',
    })
  })

  it('адрес без имени остаётся адресом', () => {
    assert.deepEqual(parseSender('feedback@example.com'), {
      email: 'feedback@example.com',
      name: null,
    })
  })

  it('кавычки вокруг имени в поле не попадают', () => {
    assert.deepEqual(parseSender('"Ритмика, поддержка" <feedback@example.com>'), {
      email: 'feedback@example.com',
      name: 'Ритмика, поддержка',
    })
  })
})

describe('запрос к Unisender Go', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('без ключа не отправляет и называет переменную', async () => {
    process.env.MAIL_PROVIDER = 'unisender'
    delete process.env.UNISENDER_API_KEY

    const result = await send(letter)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /UNISENDER_API_KEY/)
  })

  it('кириллица в ключе объясняется по-человечески', async () => {
    process.env.MAIL_PROVIDER = 'unisender'
    /* Латинская «c» заменена на кириллическую: на глаз ключ выглядит верным.
       Без проверки сюда прилетает ошибка про ByteString и код 255. */
    process.env.UNISENDER_API_KEY = 'test-key-abс123'

    const result = await send(letter)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /latin1|кириллиц/i)
  })

  it('ключ уходит заголовком, адресат и тело — в message', async () => {
    await withStand({}, async (captured) => {
      const result = await send(letter)

      assert.equal(result.ok, true)
      assert.equal(captured.length, 1)

      const request = captured[0]!
      assert.equal(request.apiKey, 'test-key-0123456789')
      assert.match(request.path, /email\/send\.json$/)
      assert.deepEqual(request.body.message?.recipients, [{ email: letter.to }])
      assert.equal(request.body.message?.subject, letter.subject)
      assert.equal(request.body.message?.body?.plaintext, letter.text)
    })
  })

  it('имя и адрес отправителя уходят раздельными полями', async () => {
    await withStand({}, async (captured) => {
      await send(letter)

      const message = captured[0]!.body.message
      assert.equal(message?.from_email, 'feedback@example.com')
      assert.equal(message?.from_name, 'Ритмика')
    })
  })

  it('своя ссылка отписки не отключается без явного разрешения', async () => {
    await withStand({}, async (captured) => {
      await send(letter)
      /* Отключение требует разрешения поддержки сервиса: поставить флаг
         по умолчанию значит получать отказ на каждом письме. */
      assert.equal(captured[0]!.body.message?.skip_unsubscribe, undefined)
    })
  })

  it('UNISENDER_SKIP_UNSUBSCRIBE=1 передаёт флаг', async () => {
    await withStand({}, async (captured) => {
      process.env.UNISENDER_SKIP_UNSUBSCRIBE = '1'
      await send(letter)
      assert.equal(captured[0]!.body.message?.skip_unsubscribe, 1)
    })
  })
})

describe('ответы Unisender Go', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('код 400 попадает в ошибку вместе с сообщением сервиса', async () => {
    await withStand(
      { status: 400, json: { status: 'error', code: 901, message: 'domain not verified' } },
      async () => {
        const result = await send(letter)
        assert.equal(result.ok, false)
        /* Сообщение сервиса важнее кода: «домен не подтверждён»
           и «превышен лимит» приходят одним и тем же 400. */
        if (!result.ok) assert.match(result.error, /domain not verified/)
      },
    )
  })

  it('status: error с кодом 200 не считается успехом', async () => {
    await withStand(
      { status: 200, json: { status: 'error', code: 101, message: 'unauthorized' } },
      async () => {
        const result = await send(letter)
        assert.equal(result.ok, false)
        if (!result.ok) assert.match(result.error, /unauthorized/)
      },
    )
  })

  it('отвергнутый адрес — не успех, хотя запрос принят', async () => {
    await withStand(
      {
        status: 200,
        json: {
          status: 'success',
          failed_emails: { 'author@ritmika.app': 'unsubscribed' },
        },
      },
      async () => {
        /* Приём запроса и приём адреса — разные вещи. Молчаливое «ok» здесь
           означало бы потерянное письмо без повтора. */
        const result = await send(letter)
        assert.equal(result.ok, false)
        if (!result.ok) assert.match(result.error, /author@ritmika\.app — unsubscribed/)
      },
    )
  })

  it('пустой failed_emails успеху не мешает', async () => {
    await withStand({ json: { status: 'success', failed_emails: {} } }, async () => {
      assert.equal((await send(letter)).ok, true)
    })
  })

  it('обрыв соединения возвращает отказ, а не бросает исключение', async () => {
    await withStand({ hangUp: true }, async () => {
      /* У вызывающего кода уже сменился статус обращения: падение
         из-за почты его откатит. */
      const result = await send(letter)
      assert.equal(result.ok, false)
    })
  })

  it('недоступный узел называет причину, а не «fetch failed»', async () => {
    process.env.MAIL_PROVIDER = 'unisender'
    process.env.UNISENDER_API_KEY = 'test-key-0123456789'
    /* Порт занимаем и сразу отпускаем: так он заведомо закрыт, и отказ
       приходит мгновенно. Число наугад дало бы то ли отказ, то ли чужой
       ответ — в зависимости от того, что запущено на машине. */
    process.env.UNISENDER_API_URL = `http://127.0.0.1:${await closedPort()}/email/send.json`

    const result = await send(letter)
    assert.equal(result.ok, false)
    /* Содержательное `fetch` прячет в cause: без разворачивания цепочки
       в журнале остаётся строка, по которой ничего не понять. */
    if (!result.ok) assert.match(result.error, /ECONNREFUSED|refused/i)
  })

  it('ответ не в JSON тоже отказ, а не падение', async () => {
    await withStand({ status: 502, json: undefined }, async () => {
      const result = await send(letter)
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /502/)
    })
  })
})
