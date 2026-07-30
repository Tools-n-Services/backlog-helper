/**
 * Охват, деньги и приоритет элемента бэклога (FR-611..614).
 *
 * Главное правило здесь — **охват считается, а не вводится**. Поле «Reach»,
 * которое заполняют руками, всегда показывает то, во что верит заполнявший:
 * оно и есть тот самый источник самообмана, ради которого приоритизацию
 * заводили. Поэтому число берётся из фактов — голосов и инсайтов — и
 * пересчитывается фоном.
 *
 * Второе правило — **дедупликация по человеку на всех уровнях**. Один
 * и тот же человек может проголосовать за три связанных обращения, быть
 * процитированным в двух инсайтах и вдобавок проголосовать за смерженный
 * дубликат. Посчитать это как шесть — значит систематически завышать
 * то, о чём громче всех говорит небольшая группа, а именно от этого
 * приоритизация и должна защищать.
 *
 * Вес сегмента (`config/scoring.ts`) отвечает на другой вопрос: сто
 * бесплатных аккаунтов и десять корпоративных — это не «сто против десяти».
 * Если сегментов у человека несколько, берётся наибольший вес: тариф —
 * это про то, чем человек уже пользуется, а не про его метки.
 */

import { scoreFormula, segmentWeights } from '@config/scoring'
import { prisma } from '@/core/db'

export interface ScoreResult {
  /** Сколько элементов изменили числа. */
  updated: number
}

interface AggregateRow {
  id: string
  reach: number
  mrr: number | null
  stored_reach: number
  stored_mrr: number | null
  impact: number | null
  confidence: number | null
  effort: number | null
  stored_score: number | null
}

/**
 * Веса сегментов из конфига — таблицей внутри запроса.
 *
 * Ключи приходят из кода, а не от пользователя, но экранирование всё равно
 * проверяется: подстановка в SQL без проверки — это привычка, которая
 * однажды встретит значение из формы.
 */
function weightsValues(): string {
  const rows = Object.entries(segmentWeights)
    .filter(([key, weight]) => /^[a-z0-9_-]+$/i.test(key) && Number.isFinite(weight))
    .map(([key, weight]) => `('${key}', ${Number(weight)}::numeric)`)

  /* Пустой набор весов — не ошибка: продукт может не делить людей
     на сегменты вовсе. Тогда каждый считается за единицу. */
  return rows.length > 0 ? rows.join(', ') : `('', 1::numeric)`
}

/**
 * Пересчитывает охват, сумму MRR и приоритет.
 *
 * `itemId` — пересчёт одного элемента: его вызывают сразу после привязки
 * обращения или добавления инсайта, чтобы карточка не показывала вчерашние
 * числа. Без аргумента пересчитывается весь бэклог — это работа воркера.
 */
export async function recalculateBacklogScores(itemId?: string): Promise<ScoreResult> {
  const rows = await prisma.$queryRawUnsafe<AggregateRow[]>(
    `
    WITH weights(segment, w) AS (VALUES ${weightsValues()}),
    scope AS (
      SELECT id FROM "backlog_item" WHERE $1::uuid IS NULL OR id = $1::uuid
    ),
    participants AS (
      /* Голосовавшие за связанные обращения — и за смерженные в них:
         merge схлопнул дубликаты, и охват обязан схлопнуться вместе с ними. */
      SELECT bp."backlog_item_id" AS item_id,
             'user:' || v."user_id"::text AS who,
             coalesce(
               (SELECT max(w.w) FROM weights w WHERE w.segment = ANY(u."segments")),
               1
             ) AS weight,
             u."company_id" AS company_id
      FROM "backlog_post" bp
      JOIN scope s ON s.id = bp."backlog_item_id"
      JOIN "post" target ON target."id" = bp."post_id"
      JOIN "post" src ON src."id" = target."id" OR src."merged_into_id" = target."id"
      JOIN "vote" v ON v."post_id" = src."id"
      JOIN "app_user" u ON u."id" = v."user_id"

      UNION ALL

      /* Инсайты на связанных обращениях. */
      SELECT bp."backlog_item_id" AS item_id,
             coalesce('user:' || i."author_id"::text, 'insight:' || i."id"::text) AS who,
             CASE
               WHEN i."author_id" IS NULL THEN i."weight"::numeric
               ELSE coalesce(
                 (SELECT max(w.w) FROM weights w WHERE w.segment = ANY(au."segments")),
                 1
               )
             END AS weight,
             coalesce(i."company_id", au."company_id") AS company_id
      FROM "insight" i
      JOIN "backlog_post" bp ON bp."post_id" = i."post_id"
      JOIN scope s ON s.id = bp."backlog_item_id"
      LEFT JOIN "app_user" au ON au."id" = i."author_id"

      UNION ALL

      /* Инсайты на самой работе: цитата может не относиться ни к одному
         обращению — её принесли со звонка, которого на портале нет. */
      SELECT i."backlog_item_id" AS item_id,
             coalesce('user:' || i."author_id"::text, 'insight:' || i."id"::text) AS who,
             CASE
               WHEN i."author_id" IS NULL THEN i."weight"::numeric
               ELSE coalesce(
                 (SELECT max(w.w) FROM weights w WHERE w.segment = ANY(au."segments")),
                 1
               )
             END AS weight,
             coalesce(i."company_id", au."company_id") AS company_id
      FROM "insight" i
      JOIN scope s ON s.id = i."backlog_item_id"
      LEFT JOIN "app_user" au ON au."id" = i."author_id"
    ),
    /* Один человек — одна строка, с наибольшим из своих весов. Здесь
       и происходит та самая дедупликация: голос, дубликат и цитата
       одного и того же человека дают единицу охвата, а не три. */
    deduped AS (
      SELECT DISTINCT ON (item_id, who) item_id, who, weight, company_id
      FROM participants
      ORDER BY item_id, who, weight DESC
    ),
    counted AS (
      SELECT item_id, sum(weight) AS reach FROM deduped GROUP BY item_id
    ),
    money AS (
      SELECT d.item_id, sum(c."monthly_spend") AS mrr
      FROM (SELECT DISTINCT item_id, company_id FROM deduped WHERE company_id IS NOT NULL) d
      JOIN "company" c ON c."id" = d.company_id
      GROUP BY d.item_id
    )
    SELECT b."id"::text AS id,
           coalesce(c.reach, 0)::float8 AS reach,
           m.mrr::float8 AS mrr,
           b."reach" AS stored_reach,
           b."mrr_sum"::float8 AS stored_mrr,
           b."impact"::float8 AS impact,
           b."confidence"::float8 AS confidence,
           b."effort"::float8 AS effort,
           b."score"::float8 AS stored_score
    FROM "backlog_item" b
    JOIN scope s ON s.id = b."id"
    LEFT JOIN counted c ON c.item_id = b."id"
    LEFT JOIN money m ON m.item_id = b."id"
  `,
    itemId ?? null,
  )

  let updated = 0
  for (const row of rows) {
    const reach = Math.round(row.reach)
    const score = scoreFormula.compute({
      reach,
      impact: row.impact,
      confidence: row.confidence,
      effort: row.effort,
    })

    if (
      reach === row.stored_reach &&
      same(row.mrr, row.stored_mrr) &&
      same(score, row.stored_score)
    ) {
      continue
    }

    await prisma.backlogItem.update({
      where: { id: row.id },
      data: { reach, mrrSum: row.mrr, score },
    })
    updated++
  }

  return { updated }
}

/** Сравнение денег и приоритета: у обоих дробная часть, точное равенство обманет. */
function same(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) < 0.0001
}
