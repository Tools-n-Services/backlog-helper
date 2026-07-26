/**
 * Trending score. Настоящая формула, а не заглушка прототипа:
 * в фазе B она переезжает в колонку и cron-джобу, но не меняется.
 *
 *   trend_score = Σ over votes of exp( -age_days(vote) / HALF_LIFE )
 *
 * Читается как «сколько голосов набрано недавно»: свежее обращение с 30 голосами
 * за неделю обгонит старое с 300 голосами трёхлетней давности.
 *
 * См. 02-data-model.md, раздел «Trending score».
 */

import { product } from '@config/product'

const MS_PER_DAY = 86_400_000

export function ageDays(at: Date, now: Date): number {
  return (now.getTime() - at.getTime()) / MS_PER_DAY
}

export function trendScore(
  voteDates: readonly Date[],
  now: Date,
  halfLifeDays: number = product.trendingHalfLifeDays,
): number {
  let score = 0
  for (const at of voteDates) {
    score += Math.exp(-ageDays(at, now) / halfLifeDays)
  }
  return score
}

/**
 * Голоса старше 3 × HALF_LIFE вносят вклад < 5% и в пересчёте не участвуют —
 * в фазе B это условие станет предикатом джобы пересчёта.
 */
export function isVoteRelevant(
  at: Date,
  now: Date,
  halfLifeDays: number = product.trendingHalfLifeDays,
): boolean {
  return ageDays(at, now) <= halfLifeDays * 3
}
