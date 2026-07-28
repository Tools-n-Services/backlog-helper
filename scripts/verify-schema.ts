/**
 * Проверка, что в базе на месте всё, чего Prisma не умеет описать.
 *
 * Нужна из-за конкретной ловушки: `prisma migrate dev` сравнивает базу
 * со схемой и «чинит» расхождения — а генерируемую колонку `search_tsv`
 * он считает обычной и пытается снять с неё выражение. Триггеры счётчиков
 * и частичные индексы он не видит вовсе, поэтому они тихо переживут любой
 * такой заход, а вот поиск сломается молча: колонка останется, запросы
 * не упадут, просто перестанут что-либо находить.
 *
 * Поэтому в проекте миграции авторские (`pnpm db:migrate` — это deploy,
 * а не dev), а эта проверка ловит нарушение правила.
 *
 *   pnpm db:verify
 */

import { existsSync } from 'node:fs'

import { prisma } from '@/core/db'

if (existsSync('.env')) process.loadEnvFile('.env')


const problems: string[] = []

function check(ok: boolean, message: string) {
  if (!ok) problems.push(message)
  console.log(`${ok ? '✓' : '✗'} ${message}`)
}

async function main() {
  const extensions = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension
  `
  const names = new Set(extensions.map((e) => e.extname))
  for (const required of ['pg_trgm', 'citext', 'pgcrypto']) {
    check(names.has(required), `расширение ${required}`)
  }

  const [encoding] = await prisma.$queryRaw<{ enc: string; collate: string }[]>`
    SELECT pg_encoding_to_char(encoding) AS enc, datcollate AS collate
    FROM pg_database WHERE datname = current_database()
  `
  check(
    encoding?.enc === 'UTF8',
    `кодировка UTF8 (сейчас ${encoding?.enc}) — иначе кириллица не индексируется`,
  )
  check(
    (encoding?.collate ?? '').toUpperCase().includes('UTF'),
    `локаль с UTF-8 (сейчас ${encoding?.collate}) — иначе pg_trgm не видит кириллицу`,
  )

  /* Часовой пояс соединения.
     Если он не UTC, драйвер и Postgres расходятся на смещение пояса:
     приложение записывает один момент, а всё, что сравнивает время внутри
     SQL, видит другой. Приложение при этом ничего не замечает — значение
     читается обратно с тем же смещением. Проверяется не настройка,
     а следствие: возраст только что записанной строки. */
  const [tz] = await prisma.$queryRaw<{ tz: string }[]>`
    SELECT current_setting('TimeZone') AS tz
  `
  check(tz?.tz === 'UTC', `часовой пояс соединения UTC (сейчас ${tz?.tz})`)

  const [skew] = await prisma.$queryRaw<{ seconds: number }[]>`
    SELECT abs(extract(epoch FROM now() - ${new Date()}::timestamptz)) AS seconds
  `
  check(
    Number(skew?.seconds ?? 999) < 60,
    `часы базы и приложения совпадают (расхождение ${Number(skew?.seconds ?? 0).toFixed(0)} с)`,
  )

  const [generated] = await prisma.$queryRaw<{ is_generated: string }[]>`
    SELECT is_generated FROM information_schema.columns
    WHERE table_name = 'post' AND column_name = 'search_tsv'
  `
  check(
    generated?.is_generated === 'ALWAYS',
    'search_tsv — генерируемая колонка (её снимает prisma migrate dev)',
  )

  const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
    SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
  `
  const triggerNames = new Set(triggers.map((t) => t.tgname))
  for (const required of [
    'vote_count_sync',
    'comment_count_sync',
    'post_counts_sync',
    'tag_post_count_sync',
    'comment_like_count_sync',
  ]) {
    check(triggerNames.has(required), `триггер ${required}`)
  }

  const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `
  const indexNames = new Set(indexes.map((i) => i.indexname))
  for (const required of [
    'post_search_tsv_idx',
    'post_title_trgm_idx',
    'post_feed_trending_idx',
    'post_feed_top_idx',
    'post_feed_new_idx',
    'post_roadmap_idx',
    'post_sla_due_idx',
  ]) {
    check(indexNames.has(required), `индекс ${required}`)
  }

  /* Практическая проверка вместо структурной: расширение может стоять,
     а локаль — резать кириллицу. Ответ на этот запрос либо осмысленный,
     либо нет. */
  const [similarity] = await prisma.$queryRaw<{ s: number }[]>`
    SELECT similarity('логин ломается', 'логин сломался') AS s
  `
  check((similarity?.s ?? 0) > 0.3, `pg_trgm различает кириллицу (${similarity?.s})`)

  const [tsv] = await prisma.$queryRaw<{ v: string }[]>`
    SELECT to_tsvector('portal_search', 'кнопка входа не работает')::text AS v
  `
  check(
    (tsv?.v ?? '').includes('кнопк'),
    `конфигурация portal_search стеммит русский (${tsv?.v})`,
  )

  /* Счётчики ведутся триггерами — сверяем с фактами. Расхождение значит,
     что где-то писали в обход или триггер отвалился. */
  const drift = await prisma.$queryRaw<{ ref: string }[]>`
    SELECT p."ref" FROM "post" p
    LEFT JOIN "vote" v ON v."post_id" = p."id"
    GROUP BY p."id", p."ref", p."vote_count"
    HAVING p."vote_count" <> count(v."id")
    LIMIT 5
  `
  check(drift.length === 0, `vote_count сходится с фактическими голосами`)

  if (problems.length > 0) {
    console.error(`\nНе в порядке: ${problems.length}. Восстановить: pnpm db:reset`)
    process.exitCode = 1
  } else {
    console.log('\nСхема в порядке.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
