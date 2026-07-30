/**
 * Объектное хранилище вложений.
 *
 * Адаптер с двумя реализациями по той же причине, что и у почты: свежий клон
 * обязан работать без единого внешнего сервиса, а боевое развёртывание —
 * складывать файлы туда, где их не потеряет перезапуск контейнера.
 *
 *   file (по умолчанию) — каталог `.data/uploads`
 *   s3                  — любое S3-совместимое хранилище: MinIO, Yandex, AWS
 *
 * Ключ объекта наружу не отдаётся никогда: файл выдаёт приложение после
 * проверки прав (02-data-model.md, «attachment»). Публичный бакет здесь
 * не годится в принципе — с ним `team_only` не соблюсти, а вложения бага
 * по умолчанию именно `team_only`.
 */

import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type StorageProvider = 'file' | 's3'

/**
 * Настройки читаются при обращении, а не при импорте модуля — как у почты:
 * скрипты подгружают `.env` сами, и при чтении на этапе импорта хранилище
 * зависело бы от порядка импортов в вызывающем файле.
 */
export function storageProvider(): StorageProvider {
  return (process.env.STORAGE_PROVIDER?.trim() || 'file') as StorageProvider
}

/** Куда складывает файлы локальный драйвер. */
export const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads')

export type StorageResult = { ok: true } | { ok: false; error: string }

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StorageResult> {
  try {
    if (storageProvider() === 's3') return await s3Put(key, body, contentType)
    const file = localPath(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/** null — объекта нет: строка в базе есть, а файла уже нет. */
export async function getObject(key: string): Promise<Buffer | null> {
  if (storageProvider() === 's3') return s3Get(key)
  try {
    return await readFile(localPath(key))
  } catch {
    return null
  }
}

export async function deleteObject(key: string): Promise<StorageResult> {
  try {
    if (storageProvider() === 's3') return await s3Delete(key)
    await rm(localPath(key), { force: true })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/**
 * Путь внутри каталога загрузок.
 *
 * Ключ приходит из кода, но проверяется всё равно: подстановка в путь без
 * проверки — привычка, которая однажды встретит `../` из формы и вынесет
 * запись за пределы каталога.
 */
function localPath(key: string): string {
  const file = path.resolve(UPLOAD_DIR, key)
  if (!file.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    throw new Error(`Ключ объекта выходит за пределы каталога загрузок: ${key}`)
  }
  return file
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* ─────────────────────────────── S3 ──────────────────────────────── */

interface S3Config {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export type S3ConfigResult = { ok: true; config: S3Config } | { ok: false; error: string }

/**
 * Настройки S3 из окружения.
 *
 * Проверяются все сразу и с именами переменных в тексте: «доступ запрещён»
 * без указания, чего не хватило, — это полчаса на угадывание, а не подсказка.
 */
export function readS3Config(
  env: Record<string, string | undefined> = process.env,
): S3ConfigResult {
  const endpoint = env.S3_ENDPOINT?.trim()
  const bucket = env.S3_BUCKET?.trim()
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim()

  const missing = [
    ['S3_ENDPOINT', endpoint],
    ['S3_BUCKET', bucket],
    ['S3_ACCESS_KEY_ID', accessKeyId],
    ['S3_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    return { ok: false, error: `STORAGE_PROVIDER=s3, но не задано: ${missing.join(', ')}` }
  }

  return {
    ok: true,
    config: {
      endpoint: endpoint!.replace(/\/+$/, ''),
      bucket: bucket!,
      /* Регион участвует в подписи, и большинству S3-совместимых хранилищ
         подходит любой непустой: по умолчанию берём тот, что принимают все. */
      region: env.S3_REGION?.trim() || 'us-east-1',
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  }
}

function objectUrl(config: S3Config, key: string): URL {
  /* Path-style адрес (`endpoint/bucket/key`), а не virtual-hosted: у MinIO
     и большинства российских хранилищ поддомен под бакет не поднят, и
     virtual-hosted упирается в неразрешимое имя. */
  return new URL(`${config.endpoint}/${config.bucket}/${encodeKey(key)}`)
}

/** Каждый сегмент ключа кодируется отдельно: `/` в пути остаётся путём. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

async function s3Request(
  method: 'PUT' | 'GET' | 'DELETE',
  key: string,
  body: Buffer | null,
  contentType?: string,
): Promise<Response> {
  const settings = readS3Config()
  if (!settings.ok) throw new Error(settings.error)
  const config = settings.config

  const url = objectUrl(config, key)
  const payloadHash = createHash('sha256')
    .update(body ?? Buffer.alloc(0))
    .digest('hex')
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const date = amzDate.slice(0, 8)

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(contentType ? { 'content-type': contentType } : {}),
  }

  const signedHeaders = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h]}\n`).join('')
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash,
  ].join('\n')

  const scope = `${date}/${config.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const signingKey = ['aws4_request'].reduce(
    (key, part) => hmac(key, part),
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), config.region), 's3'),
  )
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  return fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
    },
    ...(body ? { body: new Uint8Array(body) } : {}),
  })
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

async function s3Put(key: string, body: Buffer, contentType: string): Promise<StorageResult> {
  const response = await s3Request('PUT', key, body, contentType)
  if (response.ok) return { ok: true }
  /* Текст сервиса в ошибку целиком: «доступ запрещён» и «нет такого бакета»
     приходят одним кодом, а различать их владельцу портала нужно
     в первую очередь. */
  return { ok: false, error: `S3 ответил ${response.status}: ${(await response.text()).slice(0, 300)}` }
}

async function s3Get(key: string): Promise<Buffer | null> {
  const response = await s3Request('GET', key, null)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`S3 ответил ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function s3Delete(key: string): Promise<StorageResult> {
  const response = await s3Request('DELETE', key, null)
  /* Удаление несуществующего — не ошибка: проход retention может добежать
     до объекта, который уже убрали руками. */
  if (response.ok || response.status === 404) return { ok: true }
  return {
    ok: false,
    error: `S3 ответил ${response.status}: ${(await response.text()).slice(0, 300)}`,
  }
}
