/**
 * Доставка через Resend.
 *
 * Провайдер существовал без единого теста, пока им никто не пользовался.
 * Проверяется то же, что у Unisender: форма запроса и разбор отказов —
 * сервис отвечает на «домен не подтверждён» и «на этот адрес отправлять
 * нельзя» одним и тем же кодом, и различать их приходится по тексту.
 */

import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'vitest'

import { send } from '@/core/mail'

interface Captured {
  authorization: string | undefined
  body: { from?: string; to?: string[]; subject?: string; text?: string; html?: string }
}

interface Reply {
  status?: number
  json?: unknown
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
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
      })
      response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(reply.json ?? { id: 'letter-1' }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const saved = { ...process.env }
  process.env.MAIL_PROVIDER = 'resend'
  process.env.RESEND_API_KEY = 're_test_0123456789'
  process.env.RESEND_API_URL = `http://127.0.0.1:${port}/emails`
  process.env.MAIL_FROM = 'Ритмика <feedback@example.com>'

  try {
    await run(captured)
  } finally {
    process.env = saved
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const letter = {
  to: 'author@example.com',
  subject: 'Обращение перешло в статус «Запланировано»',
  text: 'Тело письма с кириллицей.',
}

describe('запрос к Resend', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('без ключа не отправляет и называет переменную', async () => {
    process.env.MAIL_PROVIDER = 'resend'
    delete process.env.RESEND_API_KEY

    const result = await send(letter)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /RESEND_API_KEY/)
  })

  it('кириллица в ключе объясняется по-человечески', async () => {
    process.env.MAIL_PROVIDER = 'resend'
    /* Латинская «e» заменена на кириллическую: на глаз ключ верный. */
    process.env.RESEND_API_KEY = 'rе_test_0123456789'

    const result = await send(letter)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /latin1|кириллиц/i)
  })

  it('ключ уходит Bearer-заголовком, письмо — целиком', async () => {
    await withStand({}, async (captured) => {
      const result = await send(letter)

      assert.equal(result.ok, true)
      const request = captured[0]!
      assert.equal(request.authorization, 'Bearer re_test_0123456789')
      assert.equal(request.body.from, 'Ритмика <feedback@example.com>')
      assert.deepEqual(request.body.to, [letter.to])
      assert.equal(request.body.subject, letter.subject)
      assert.equal(request.body.text, letter.text)
    })
  })

  it('письма уходят текстом, без html', async () => {
    await withStand({}, async (captured) => {
      await send(letter)
      /* Письма портала намеренно текстовые: их читают в почтовом клиенте
         подписчика, а не в браузере, и вёрстка здесь только мешает. */
      assert.equal(captured[0]!.body.html, undefined)
    })
  })
})

describe('ответы Resend', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('неподтверждённый домен объясняется словами сервиса', async () => {
    await withStand(
      {
        status: 403,
        json: { statusCode: 403, message: 'The example.com domain is not verified' },
      },
      async () => {
        const result = await send(letter)
        assert.equal(result.ok, false)
        if (!result.ok) assert.match(result.error, /domain is not verified/)
      },
    )
  })

  it('запрет отправки на чужой адрес тоже виден дословно', async () => {
    await withStand(
      {
        status: 403,
        json: { statusCode: 403, message: 'You can only send testing emails to your own address' },
      },
      async () => {
        /* Тот же 403, что и «домен не подтверждён»: без текста сервиса
           владелец портала не поймёт, что именно исправлять. */
        const result = await send(letter)
        assert.equal(result.ok, false)
        if (!result.ok) assert.match(result.error, /your own address/)
      },
    )
  })

  it('успех без идентификатора письма успехом не считается', async () => {
    await withStand({ status: 200, json: { ok: true } }, async () => {
      /* Ответ 200 без id приходит не от Resend, а от чего-то на его месте:
         прокси или заглушки. Считать это отправкой значит потерять письмо. */
      const result = await send(letter)
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /идентификатор/)
    })
  })

  it('превышение лимита возвращает отказ с кодом', async () => {
    await withStand(
      { status: 429, json: { statusCode: 429, message: 'Too many requests' } },
      async () => {
        const result = await send(letter)
        assert.equal(result.ok, false)
        /* Очередь повторит: письмо остаётся неотправленным, а не теряется. */
        if (!result.ok) assert.match(result.error, /429/)
      },
    )
  })
})
