#!/usr/bin/env node
/**
 * Локальный Postgres без Docker и без установки СУБД в систему.
 *
 * Бинарники настоящего PostgreSQL приезжают пакетом `embedded-postgres`,
 * кластер живёт в `.data/pg`, управление — через `pg_ctl`. Именно `pg_ctl`,
 * а не класс из библиотеки: тот держит postgres дочерним процессом и убивает
 * его при выходе скрипта, то есть `pnpm db:up` пришлось бы не закрывать.
 * Через `pg_ctl` база остаётся демоном, и `pnpm dev` просто подключается.
 *
 * Развёртывание от этого не усложняется: наружу торчит обычный DATABASE_URL.
 * Если он указывает не на локальный кластер (управляемый Postgres в проде),
 * эти команды просто не нужны — код приложения одинаковый.
 *
 *   node scripts/pg.mjs up      поднять (инициализировать при первом запуске)
 *   node scripts/pg.mjs down    остановить
 *   node scripts/pg.mjs status  состояние
 *   node scripts/pg.mjs reset   снести кластер и поднять пустым
 */

import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, '.data', 'pg')
const LOG_FILE = path.join(ROOT, '.data', 'pg.log')

/**
 * initdb по умолчанию берёт локаль из окружения и на многих машинах даёт
 * SQL_ASCII + C. Для русскоязычного портала это тихая катастрофа: pg_trgm
 * перестаёт видеть кириллицу (similarity → 0), to_tsvector('russian', …)
 * возвращает пустой вектор. Поиск похожих и полнотекстовый поиск при этом
 * не падают — они просто ничего не находят. Поэтому локаль задана жёстко.
 */
const INITDB_FLAGS = ['--encoding=UTF8', '--locale=C.UTF-8']

/** Читает .env, не подключая зависимость: нужен один DATABASE_URL. */
async function readEnv() {
  const file = path.join(ROOT, '.env')
  if (!existsSync(file)) return {}
  const text = await readFile(file, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

async function connection() {
  const env = await readEnv()
  const raw = process.env.DATABASE_URL ?? env.DATABASE_URL
  if (!raw) {
    throw new Error(
      'DATABASE_URL не задан. Скопируйте .env.example в .env: cp .env.example .env',
    )
  }
  const url = new URL(raw)
  return {
    url: raw,
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username) || 'postgres',
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || 'postgres',
  }
}

/** Пути к бинарникам платформы. Пакет ставится как зависимость embedded-postgres. */
async function binaries() {
  const require = createRequire(import.meta.url)
  const platformPackage = `@embedded-postgres/${os.platform()}-${os.arch()}`
  try {
    const fromLibrary = createRequire(require.resolve('embedded-postgres'))
    return await import(fromLibrary.resolve(platformPackage))
  } catch (error) {
    throw new Error(
      `Не найдены бинарники Postgres (${platformPackage}). ` +
        'Проверьте, что pnpm разрешил postinstall для @embedded-postgres/* ' +
        `(pnpm-workspace.yaml → onlyBuiltDependencies), и выполните pnpm install.\n${error.message}`,
    )
  }
}

async function pgCtl(args, { quiet = false } = {}) {
  const { pg_ctl } = await binaries()
  try {
    const { stdout } = await run(pg_ctl, ['-D', DATA_DIR, ...args])
    return { ok: true, stdout }
  } catch (error) {
    if (!quiet) process.stderr.write(error.stdout ?? '')
    return { ok: false, stdout: error.stdout ?? '', error }
  }
}

async function isRunning() {
  if (!existsSync(DATA_DIR)) return false
  const { ok } = await pgCtl(['status'], { quiet: true })
  return ok
}

async function initialise(conn) {
  const { initdb } = await binaries()
  await mkdir(path.dirname(DATA_DIR), { recursive: true })

  /* Пароль передаётся файлом, а не аргументом: аргументы видны в ps. */
  const passwordFile = path.join(os.tmpdir(), `bh-initdb-${process.pid}`)
  await writeFile(passwordFile, conn.password, { mode: 0o600 })
  try {
    await run(initdb, [
      '-D', DATA_DIR,
      '-U', conn.user,
      '--auth=scram-sha-256',
      `--pwfile=${passwordFile}`,
      ...INITDB_FLAGS,
    ])
  } finally {
    await rm(passwordFile, { force: true })
  }
}

async function up() {
  const conn = await connection()

  if (await isRunning()) {
    console.log(`Postgres уже запущен на порту ${conn.port}.`)
    return
  }

  const first = !existsSync(DATA_DIR)
  if (first) {
    console.log('Первый запуск: инициализирую кластер в .data/pg (UTF8, C.UTF-8)…')
    await initialise(conn)
  }

  await mkdir(path.dirname(LOG_FILE), { recursive: true })
  const started = await pgCtl([
    '-l', LOG_FILE,
    '-o', `-p ${conn.port} -k ${DATA_DIR}`,
    '-w',
    'start',
  ])
  if (!started.ok) {
    throw new Error(
      `Не удалось запустить Postgres. Журнал: ${path.relative(ROOT, LOG_FILE)}`,
    )
  }

  /* База продукта создаётся отдельно: initdb заводит только служебную postgres. */
  if (first) await createDatabase(conn)

  console.log(`Postgres ${conn.port} поднят. Данные: .data/pg, журнал: .data/pg.log`)
  if (first) console.log('Дальше: pnpm db:migrate && pnpm db:seed')
}

async function createDatabase(conn) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    host: conn.host,
    port: Number(conn.port),
    user: conn.user,
    password: conn.password,
    database: 'postgres',
  })
  await client.connect()
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [
      conn.database,
    ])
    if (exists.rowCount === 0) {
      /* Имя базы нельзя передать параметром — экранируем идентификатор. */
      await client.query(`create database "${conn.database.replace(/"/g, '""')}"`)
      console.log(`База ${conn.database} создана.`)
    }
  } finally {
    await client.end()
  }
}

async function down() {
  if (!(await isRunning())) {
    console.log('Postgres не запущен.')
    return
  }
  const stopped = await pgCtl(['-w', '-m', 'fast', 'stop'])
  console.log(stopped.ok ? 'Postgres остановлен.' : 'Остановить не удалось.')
  if (!stopped.ok) process.exitCode = 1
}

async function status() {
  const conn = await connection()
  const running = await isRunning()
  console.log(running ? `запущен · порт ${conn.port}` : 'остановлен')
  if (!running) process.exitCode = 1
}

async function reset() {
  if (await isRunning()) await pgCtl(['-w', '-m', 'immediate', 'stop'])
  await rm(path.join(ROOT, '.data'), { recursive: true, force: true })
  console.log('Кластер удалён.')
  await up()
}

const commands = { up, down, status, reset }
const command = process.argv[2] ?? 'up'

if (!(command in commands)) {
  console.error(`Неизвестная команда: ${command}. Доступны: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}

try {
  await commands[command]()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
