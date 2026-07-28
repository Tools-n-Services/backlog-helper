/**
 * Нагрузочная проверка (NFR-01).
 *
 * Частичные индексы под ленту, роадмап и очередь триажа созданы миграцией,
 * но на полусотне обращений планировщик берёт seq scan независимо от них —
 * то есть до этой проверки они не были проверены ни разу. Смысл не в цифрах
 * как таковых, а в ответе на два вопроса: укладываемся ли в 500 мс на p95
 * и идёт ли хоть один ключевой запрос последовательным чтением.
 *
 *   pnpm db:bench            наполнить до 15 000 и замерить
 *   pnpm db:bench --measure  только замер, на том, что уже в базе
 *   pnpm db:bench --posts=50000
 *
 * ВНИМАНИЕ: наполнение дописывает обращения к существующим данным.
 * Демонстрационные обращения при этом остаются — восстановить исходное
 * состояние можно `pnpm db:seed`.
 */

import { product } from '@config/product'
import { prisma } from '@/core/db'
import { queries } from '@/queries'
import { mulberry32 } from '@config/seed'

const TARGET_POSTS = 15_000
/** Сколько голосов приходится на обращение в среднем. */
const VOTES_PER_POST = 30
const BATCH = 500

/** Порог из NFR-01. */
const P95_BUDGET_MS = 500

interface Measurement {
  what: string
  runs: number
  p50: number
  p95: number
  worst: number
}

async function main() {
  const target = Number(
    process.argv.find((a) => a.startsWith('--posts='))?.split('=')[1] ?? TARGET_POSTS,
  )

  if (!process.argv.includes('--measure')) await fill(target)
  const measurements = await measure()

  console.log('\n  что                                p50     p95   худший')
  console.log('  ' + '─'.repeat(56))
  for (const m of measurements) {
    const over = m.p95 > P95_BUDGET_MS ? '  ✗' : ''
    console.log(
      `  ${m.what.padEnd(32)} ${ms(m.p50)} ${ms(m.p95)} ${ms(m.worst)}${over}`,
    )
  }

  const failed = measurements.filter((m) => m.p95 > P95_BUDGET_MS)
  const scans = await seqScans()

  if (scans.length > 0) {
    console.log('\n  Последовательное чтение по post:')
    for (const s of scans) console.log(`    ${s.what}`)
  }

  if (failed.length === 0 && scans.length === 0) {
    console.log(`\n  Уложились: p95 меньше ${P95_BUDGET_MS} мс, индексы работают.`)
  } else {
    console.error(
      `\n  Не уложились: ${failed.length} запросов медленнее ${P95_BUDGET_MS} мс, ` +
        `${scans.length} идут seq scan.`,
    )
    process.exitCode = 1
  }
}

/* ────────────────────────── Наполнение ────────────────────────── */

/**
 * Досыпает обращения до нужного объёма.
 *
 * Данные не должны быть однородными: если у всех обращений одинаковое число
 * голосов и одна дата, планировщик получает идеальную статистику, какой
 * в жизни не бывает, и проверка перестаёт что-либо значить. Поэтому разброс
 * по доскам, статусам, датам и голосам — как в настоящей ленте, где
 * несколько обращений собирают тысячи голосов, а хвост — единицы.
 */
async function fill(target: number) {
  const existing = await prisma.post.count()
  const missing = target - existing
  if (missing <= 0) {
    console.log(`В базе уже ${existing} обращений — наполнять нечего.`)
    return
  }

  const [boards, statuses, types, authors] = await Promise.all([
    prisma.board.findMany({ select: { id: true } }),
    prisma.status.findMany({ select: { id: true, isTerminal: true } }),
    prisma.postType.findMany({ where: { publicFeed: true }, select: { id: true } }),
    prisma.appUser.findMany({ select: { id: true }, take: 2000 }),
  ])
  if (!boards.length || !statuses.length || !types.length || !authors.length) {
    throw new Error('Справочники пусты: сначала pnpm db:seed')
  }

  console.log(`Досыпаю ${missing} обращений до ${target}…`)
  const started = Date.now()
  const rand = mulberry32(20260728)
  const maxRef = await nextRefStart()

  for (let done = 0; done < missing; done += BATCH) {
    const size = Math.min(BATCH, missing - done)
    const posts = Array.from({ length: size }, (_, i) => {
      const n = existing + done + i
      const ageDays = rand() * 720
      const created = new Date(Date.now() - ageDays * 86_400_000)
      return {
        boardId: boards[Math.floor(rand() * boards.length)]!.id,
        typeId: types[Math.floor(rand() * types.length)]!.id,
        statusId: statuses[Math.floor(rand() * statuses.length)]!.id,
        authorId: authors[Math.floor(rand() * authors.length)]!.id,
        title: `Нагрузочное обращение ${n}: ${phrase(rand, `маркер${n}`)}`,
        slug: `bench-${n}`,
        ref: `BENCH-${maxRef + n}`,
        details: `${phrase(rand)} ${phrase(rand)}`,
        createdAt: created,
        updatedAt: created,
        /* Голоса не создаём построчно для каждого — это полмиллиона строк
           и полчаса. Счётчик ставим сразу, а настоящие голоса раздаём
           только части обращений: сортировкам нужен разброс, а таблице
           vote — правдоподобный объём. */
        voteCount: Math.floor(rand() ** 3 * 900),
        trendScore: rand() ** 3 * 300,
      }
    })
    await prisma.post.createMany({ data: posts, skipDuplicates: true })
    process.stdout.write(`\r  обращений: ${Math.min(done + size, missing)}/${missing}`)
  }
  process.stdout.write('\n')

  await fillVotes(target * VOTES_PER_POST, authors.map((a) => a.id), rand)

  console.log(`Наполнено за ${((Date.now() - started) / 1000).toFixed(0)} с.`)
  console.log('ANALYZE…')
  /* Без свежей статистики планировщик выбирает план по данным, которых
     уже нет: проверять индексы в таком состоянии бессмысленно. */
  await prisma.$executeRawUnsafe('ANALYZE "post", "vote", "comment"')
}

async function fillVotes(target: number, authorIds: string[], rand: () => number) {
  const existing = await prisma.vote.count()
  const missing = target - existing
  if (missing <= 0) return

  const posts = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "post" WHERE "slug" LIKE 'bench-%' ORDER BY "id" LIMIT 20000
  `
  if (posts.length === 0) return

  console.log(`Досыпаю ${missing} голосов…`)
  let made = 0
  for (const post of posts) {
    if (made >= missing) break
    const count = Math.min(authorIds.length, Math.floor(rand() * 60))
    if (count === 0) continue

    await prisma.vote.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        postId: post.id,
        userId: authorIds[i]!,
        createdAt: new Date(Date.now() - rand() * 200 * 86_400_000),
      })),
      skipDuplicates: true,
    })
    made += count
    if (made % 20_000 < count) process.stdout.write(`\r  голосов: ${made}/${missing}`)
  }
  process.stdout.write('\n')
}

async function nextRefStart(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT max(substring("ref" from '[0-9]+$')::int) AS max FROM "post"
  `
  return (row?.max ?? 0) + 1
}

/**
 * Словарь для текстов.
 *
 * Большой намеренно. С коротким словарём каждое слово попадает в большинство
 * обращений, и полнотекстовый поиск честно уходит в seq scan: при выборке
 * в две трети таблицы это и есть верный план. Проверка индекса на таких
 * данных проверяет не индекс, а генератор.
 */
const WORDS = [
  'смена', 'график', 'экспорт', 'отчёт', 'уведомление', 'шаблон', 'филиал',
  'сотрудник', 'табель', 'переработка', 'выгрузка', 'синхронизация', 'права',
  'приложение', 'печать', 'интеграция', 'календарь', 'напоминание', 'ночная',
  'вахта', 'подмена', 'отпуск', 'больничный', 'ставка', 'оклад', 'премия',
  'ведомость', 'подпись', 'согласование', 'бухгалтерия', 'кассир', 'склад',
  'логистика', 'маршрут', 'доставка', 'инвентаризация', 'ревизия', 'касса',
  'терминал', 'сканер', 'штрихкод', 'наклейка', 'этикетка', 'приёмка',
  'списание', 'возврат', 'брак', 'поставщик', 'договор', 'счёт', 'акт',
  'реестр', 'архив', 'выписка', 'сверка', 'корректировка', 'перенос',
  'дубликат', 'фильтр', 'сортировка', 'колонка', 'вкладка', 'виджет',
  'дашборд', 'диаграмма', 'сводка', 'период', 'квартал', 'смещение',
  'часовой пояс', 'локаль', 'валюта', 'округление', 'формула', 'коэффициент',
]

/**
 * Заголовок с редким словом.
 *
 * Каждое обращение получает собственный маркер — иначе разброс частот
 * получается плоским, а на плоских частотах планировщик ведёт себя иначе,
 * чем на живых данных, где есть и частые слова, и почти уникальные.
 */
function phrase(rand: () => number, marker?: string): string {
  const n = 5 + Math.floor(rand() * 5)
  const words = Array.from(
    { length: n },
    () => WORDS[Math.floor(rand() * WORDS.length)],
  )
  if (marker) words.splice(Math.floor(rand() * words.length), 0, marker)
  return words.join(' ')
}

/* ─────────────────────────── Замеры ───────────────────────────── */

const RUNS = 12

async function measure(): Promise<Measurement[]> {
  const boards = await prisma.board.findMany({
    where: { visibility: 'public' },
    select: { slug: true },
    orderBy: { position: 'asc' },
  })
  const board = boards[0]?.slug ?? 'product'
  const feed = (over: object = {}) =>
    ({
      boardSlug: board,
      sort: 'trending' as const,
      statusKeys: [],
      typeKeys: [],
      categorySlugs: [],
      search: '',
      limit: product.limits.feedPageSize,
      ...over,
    })

  const total = await prisma.post.count()
  console.log(`\nЗамер на ${total} обращениях, ${await prisma.vote.count()} голосах.`)

  return [
    await time('лента, популярные', () => queries.getFeed(feed())),
    await time('лента, топ', () => queries.getFeed(feed({ sort: 'top' }))),
    await time('лента, новые', () => queries.getFeed(feed({ sort: 'new' }))),
    await time('лента с фильтром статуса', () =>
      queries.getFeed(feed({ statusKeys: ['open'] })),
    ),
    await time('поиск по ленте', () => queries.getFeed(feed({ search: 'экспорт отчёт' }))),
    await time('роадмап', () => queries.getRoadmap()),
    await time('очередь триажа', () =>
      queries.getTriageQueue({
        sort: 'auto',
        overdueOnly: false,
        severityKeys: [],
        typeKeys: [],
        search: '',
      }),
    ),
    await time('похожие при вводе', () =>
      queries.findSimilar({ boardSlug: board, typeKey: 'idea', title: 'экспорт графика' }),
    ),
    await time('список досок', () => queries.listBoards()),
  ]
}

async function time(what: string, run: () => Promise<unknown>): Promise<Measurement> {
  /* Первый прогон прогревает кэш и не участвует в замере: он меряет
     компиляцию плана, а не работу запроса. */
  await run()

  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now()
    await run()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)

  return {
    what,
    runs: RUNS,
    p50: samples[Math.floor(RUNS * 0.5)]!,
    p95: samples[Math.min(RUNS - 1, Math.floor(RUNS * 0.95))]!,
    worst: samples.at(-1)!,
  }
}

/**
 * Ключевые запросы, которые идут последовательным чтением.
 *
 * Проверяется отдельно от времени: на прогретом кэше seq scan по 15 000
 * строк успевает уложиться в бюджет и выглядит здоровым — ровно до того
 * дня, когда обращений станет вдесятеро больше.
 */
async function seqScans(): Promise<{ what: string }[]> {
  const board = await prisma.board.findFirstOrThrow({ select: { id: true, slug: true } })
  const status = await prisma.status.findFirstOrThrow({ where: { key: 'open' } })

  const checks: { what: string; sql: string }[] = [
    {
      what: 'лента по trend_score',
      sql: `SELECT "id" FROM "post"
            WHERE "board_id" = '${board.id}' AND "merged_into_id" IS NULL
              AND "moderation" = 'approved'
            ORDER BY "pinned" DESC, "trend_score" DESC, "id" ASC LIMIT 12`,
    },
    {
      what: 'лента по голосам',
      sql: `SELECT "id" FROM "post"
            WHERE "board_id" = '${board.id}' AND "merged_into_id" IS NULL
              AND "moderation" = 'approved'
            ORDER BY "pinned" DESC, "vote_count" DESC, "id" ASC LIMIT 12`,
    },
    {
      what: 'роадмап по статусу',
      sql: `SELECT "id" FROM "post"
            WHERE "status_id" = '${status.id}' AND "merged_into_id" IS NULL
              AND "moderation" = 'approved'
            ORDER BY "vote_count" DESC LIMIT 3`,
    },
    {
      /* Ровно тот запрос, который выполняет `searchMatches`, а не его
         упрощённая версия: план у запроса с ранжированием и триграммами
         совсем другой, и проверять облегчённый — значит проверять то,
         чего в продукте нет. */
      what: 'поиск по ленте',
      sql: `SELECT p."id" FROM "post" p
            WHERE p."search_tsv" @@ websearch_to_tsquery('portal_search', 'экспорт отчёт')
               OR 'экспорт отчёт' <% p."title"
            ORDER BY
              ts_rank(p."search_tsv", websearch_to_tsquery('portal_search', 'экспорт отчёт')) DESC,
              word_similarity('экспорт отчёт', p."title") DESC
            LIMIT 500`,
    },
  ]

  const bad: { what: string }[] = []
  for (const check of checks) {
    const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (FORMAT TEXT) ${check.sql}`,
    )
    const text = plan.map((r) => r['QUERY PLAN']).join('\n')
    if (/Seq Scan on post/i.test(text)) {
      bad.push({ what: `${check.what}\n${indent(text)}` })
    }
  }
  return bad
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n')
}

function ms(value: number): string {
  return `${value.toFixed(0).padStart(5)} мс`
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
