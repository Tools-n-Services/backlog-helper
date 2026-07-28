/**
 * Фоновые пересчёты (02-data-model.md, «Денормализованные счётчики», «Trending score»).
 *
 * Три прохода, и каждый закрывает свой способ незаметно разойтись с правдой.
 * Общее у них то, что без них ничего не ломается на глазах: лента остаётся
 * правдоподобной, счётчики — похожими на настоящие, и заметить расхождение
 * можно только пересчётом. Поэтому пересчёт и есть продукт.
 *
 * Всё выполняется SQL-запросами, а не выборкой в память: пересчитывать
 * пятнадцать тысяч обращений по одному — это пятнадцать тысяч обращений
 * к базе там, где хватает одного.
 */

import { product } from '@config/product'
import { prisma } from '@/core/db'

/* ────────────────────────── Trending ──────────────────────────── */

export interface TrendingResult {
  updated: number
}

/**
 * Пересчёт `trend_score`.
 *
 *   trend_score = Σ по голосам exp( −возраст_в_днях / HALF_LIFE )
 *
 * При голосовании счётчик растёт на единицу сразу — чтобы интерфейс
 * реагировал мгновенно, — и именно поэтому расходится: инкремент не знает
 * ни о затухании старых голосов, ни о снятых.
 *
 * Точно считаются только обращения с голосами за последние `3 × HALF_LIFE`
 * дней. Остальным ставится ноль: их настоящий вклад меньше пяти процентов
 * от одного голоса, то есть асимптотически ноль, а суммировать ради этого
 * весь архив каждый час незачем.
 *
 * Обнулять обязательно, а не пропускать. Обращение, потерявшее последний
 * голос или просто состарившееся, иначе навсегда сохраняет вес, набранный
 * когда-то, — и держится в «Популярном» уже без всякой популярности.
 */
export async function recalculateTrending(): Promise<TrendingResult> {
  const halfLife = product.trendingHalfLifeDays
  const horizonDays = halfLife * 3

  const updated = await prisma.$executeRawUnsafe(
    `
    WITH computed AS (
      SELECT p."id",
             CASE
               WHEN EXISTS (
                 SELECT 1 FROM "vote" recent
                 WHERE recent."post_id" = p."id"
                   AND recent."created_at" > now() - ($2 || ' days')::interval
               )
               THEN coalesce((
                 SELECT sum(exp(-(extract(epoch FROM now() - v."created_at") / 86400.0) / $1))
                 FROM "vote" v
                 WHERE v."post_id" = p."id"
               ), 0)
               ELSE 0
             END AS score
      FROM "post" p
    )
    UPDATE "post" p
    SET "trend_score" = computed.score
    FROM computed
    WHERE p."id" = computed."id"
      AND p."trend_score" IS DISTINCT FROM computed.score
    `,
    halfLife,
    horizonDays,
  )

  return { updated }
}

/* ─────────────────────────── Сверка ───────────────────────────── */

export interface CounterDrift {
  table: string
  id: string
  ref: string | null
  column: string
  stored: number
  actual: number
}

export interface ReconcileResult {
  drift: CounterDrift[]
  fixed: number
}

/**
 * Сверка денормализованных счётчиков с фактами.
 *
 * Их ведут триггеры, и триггеры не забывают. Но мимо триггеров пишут импорт,
 * ручные правки в базе и восстановление из копии с отключёнными триггерами —
 * а расхождение счётчика на карточке никто не заметит: число выглядит
 * правдоподобно ровно до того дня, когда кто-нибудь его проверит.
 *
 * Расхождения возвращаются списком, чтобы их было видно в журнале: молчаливое
 * исправление скрывает причину, а причина — это обычно место, где пишут
 * в обход.
 */
export async function reconcileCounters(fix = true): Promise<ReconcileResult> {
  const drift: CounterDrift[] = []

  const votes = await prisma.$queryRaw<
    { id: string; ref: string; stored: number; actual: bigint }[]
  >`
    SELECT p."id", p."ref", p."vote_count" AS stored, count(v."id") AS actual
    FROM "post" p LEFT JOIN "vote" v ON v."post_id" = p."id"
    GROUP BY p."id", p."ref", p."vote_count"
    HAVING p."vote_count" <> count(v."id")
  `
  for (const row of votes) {
    drift.push({
      table: 'post',
      id: row.id,
      ref: row.ref,
      column: 'vote_count',
      stored: row.stored,
      actual: Number(row.actual),
    })
  }

  const comments = await prisma.$queryRaw<
    { id: string; ref: string; stored: number; actual: bigint }[]
  >`
    SELECT p."id", p."ref", p."comment_count" AS stored, count(c."id") AS actual
    FROM "post" p
    LEFT JOIN "comment" c
      ON c."post_id" = p."id" AND c."deleted_at" IS NULL AND NOT c."internal"
    GROUP BY p."id", p."ref", p."comment_count"
    HAVING p."comment_count" <> count(c."id")
  `
  for (const row of comments) {
    drift.push({
      table: 'post',
      id: row.id,
      ref: row.ref,
      column: 'comment_count',
      stored: row.stored,
      actual: Number(row.actual),
    })
  }

  const boards = await prisma.$queryRaw<
    { id: string; slug: string; stored: number; actual: bigint }[]
  >`
    SELECT b."id", b."slug", b."post_count" AS stored, count(p."id") AS actual
    FROM "board" b
    LEFT JOIN "post" p ON p."board_id" = b."id"
      AND p."merged_into_id" IS NULL
      AND p."moderation" = 'approved'
      AND EXISTS (SELECT 1 FROM "post_type" t WHERE t."id" = p."type_id" AND t."public_feed")
    GROUP BY b."id", b."slug", b."post_count"
    HAVING b."post_count" <> count(p."id")
  `
  for (const row of boards) {
    drift.push({
      table: 'board',
      id: row.id,
      ref: row.slug,
      column: 'post_count',
      stored: row.stored,
      actual: Number(row.actual),
    })
  }

  if (!fix || drift.length === 0) return { drift, fixed: 0 }

  for (const item of drift) {
    if (item.table === 'post') {
      await prisma.$executeRawUnsafe(
        `UPDATE "post" SET "${item.column}" = $1 WHERE "id" = $2::uuid`,
        item.actual,
        item.id,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "board" SET "${item.column}" = $1 WHERE "id" = $2::uuid`,
        item.actual,
        item.id,
      )
    }
  }

  return { drift, fixed: drift.length }
}

/* ───────────────────────── Охват ──────────────────────────────── */

export interface AffectedResult {
  updated: number
}

/**
 * Пересчёт `affected_count` — скольких людей это касается (FR-524).
 *
 *   affected_count = уникальные user_id из голосов за обращение
 *                    ∪ голосов за смерженные в него
 *                    ∪ авторов инсайтов, привязанных к нему
 *
 * Триггером это посчитать нельзя: нужна дедупликация по человеку через
 * несколько связей. Один и тот же человек мог проголосовать и за обращение,
 * и за смерженный в него дубликат — засчитать это дважды значит завысить
 * охват ровно на то, что merge и был призван схлопнуть.
 *
 * Инсайты без автора считаются каждый за одного: цитата из звонка от
 * неизвестного клиента — это всё же ещё один затронутый.
 */
export async function recalculateAffected(): Promise<AffectedResult> {
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "post" p
    SET "affected_count" = counted.total
    FROM (
      SELECT target."id",
             (
               SELECT count(*) FROM (
                 SELECT v."user_id"::text AS who
                 FROM "vote" v
                 WHERE v."post_id" = target."id"
                    OR v."post_id" IN (
                      SELECT m."id" FROM "post" m WHERE m."merged_into_id" = target."id"
                    )
                 UNION
                 SELECT coalesce(i."author_id"::text, 'insight:' || i."id"::text)
                 FROM "insight" i
                 WHERE i."post_id" = target."id"
               ) AS people
             ) AS total
      FROM "post" target
      WHERE target."merged_into_id" IS NULL
    ) AS counted
    WHERE p."id" = counted."id"
      AND p."affected_count" IS DISTINCT FROM counted.total
  `)

  return { updated }
}
