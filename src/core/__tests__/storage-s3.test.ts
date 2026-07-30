/**
 * S3-совместимое хранилище.
 *
 * Проверяется форма запроса против локального стенда — тем же приёмом, что
 * у почтовых провайдеров. Настоящего бакета здесь нет и быть не может,
 * а вот подпись SigV4 сломать легко и незаметно: хранилище ответит
 * «доступ запрещён», и отличить неверную подпись от неверного ключа
 * по этому ответу нельзя.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'vitest'

import { deleteObject, getObject, putObject, readS3Config, UPLOAD_DIR } from '@/core/storage'

interface Captured {
  method: string
  url: string
  authorization: string | undefined
  contentSha: string | undefined
  body: Buffer
}

async function withStand(
  reply: { status?: number; body?: Buffer },
  run: (captured: Captured[]) => Promise<void>,
): Promise<void> {
  const captured: Captured[] = []

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      captured.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: request.headers.authorization,
        contentSha: request.headers['x-amz-content-sha256'] as string | undefined,
        body: Buffer.concat(chunks),
      })
      response.writeHead(reply.status ?? 200)
      response.end(reply.body ?? Buffer.alloc(0))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const saved = { ...process.env }
  process.env.STORAGE_PROVIDER = 's3'
  process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`
  process.env.S3_BUCKET = 'portal'
  process.env.S3_ACCESS_KEY_ID = 'test-key'
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret'

  try {
    await run(captured)
  } finally {
    process.env = saved
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('настройки S3', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('нехватка переменных называется поимённо', () => {
    const result = readS3Config({ S3_ENDPOINT: 'https://s3.example', S3_BUCKET: 'portal' })

    assert.equal(result.ok, false)
    /* «Доступ запрещён» без указания, чего не хватило, — это полчаса
       на угадывание вместо подсказки. */
    if (!result.ok) {
      assert.match(result.error, /S3_ACCESS_KEY_ID/)
      assert.match(result.error, /S3_SECRET_ACCESS_KEY/)
    }
  })

  it('регион по умолчанию не пустой: он участвует в подписи', () => {
    const result = readS3Config({
      S3_ENDPOINT: 'https://s3.example/',
      S3_BUCKET: 'portal',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.ok(result.config.region.length > 0)
      /* Хвостовой слэш в адресе даёт `//portal/key` и подпись под другой путь. */
      assert.equal(result.config.endpoint, 'https://s3.example')
    }
  })
})

describe('запросы к S3', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('объект кладётся path-style и подписывается SigV4', async () => {
    const body = Buffer.from('содержимое вложения', 'utf8')

    await withStand({}, async (captured) => {
      const result = await putObject('attachments/abc.png', body, 'image/png')
      assert.equal(result.ok, true)

      const request = captured[0]!
      assert.equal(request.method, 'PUT')
      /* Path-style: у MinIO и российских хранилищ поддомен под бакет
         не поднят, и virtual-hosted упёрся бы в неразрешимое имя. */
      assert.equal(request.url, '/portal/attachments/abc.png')
      assert.match(request.authorization ?? '', /^AWS4-HMAC-SHA256 Credential=test-key\//)
      assert.match(request.authorization ?? '', /SignedHeaders=[^,]*x-amz-content-sha256/)
      assert.match(request.authorization ?? '', /Signature=[0-9a-f]{64}/)
      /* Хеш тела входит в подпись: хранилище проверяет, что дошло ровно то,
         что подписали. */
      assert.equal(request.contentSha, createHash('sha256').update(body).digest('hex'))
      assert.deepEqual(request.body, body)
    })
  })

  it('отказ хранилища доходит словами сервиса', async () => {
    await withStand(
      { status: 403, body: Buffer.from('<Error><Code>AccessDenied</Code></Error>') },
      async () => {
        const result = await putObject('attachments/abc.png', Buffer.from('x'), 'image/png')

        assert.equal(result.ok, false)
        if (!result.ok) {
          assert.match(result.error, /403/)
          assert.match(result.error, /AccessDenied/)
        }
      },
    )
  })

  it('отсутствующий объект — null, а не исключение', async () => {
    await withStand({ status: 404 }, async () => {
      assert.equal(await getObject('attachments/missing.png'), null)
    })
  })

  it('удаление того, чего нет, не считается ошибкой', async () => {
    await withStand({ status: 404 }, async () => {
      /* Проход retention может добежать до объекта, который уже убрали
         руками, — и это не повод оставлять строку в базе навсегда. */
      assert.equal((await deleteObject('attachments/missing.png')).ok, true)
    })
  })
})

describe('локальное хранилище', () => {
  it('ключ не выводит запись за пределы каталога загрузок', async () => {
    const result = await putObject('../../etc/passwd', Buffer.from('x'), 'text/plain')

    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /за пределы/)
    assert.ok(UPLOAD_DIR.endsWith('uploads'))
  })
})
