/**
 * Лимит на создание обращений (FR-126).
 *
 * Превышение обязано давать понятную ошибку, а не пятисотку: человек, который
 * упёрся в лимит, — это чаще всего не спамер, а тот, кому действительно
 * есть что сказать.
 */

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 24 * MS_PER_HOUR

export interface RateLimits {
  postsPerHour: number
  postsPerDay: number
}

export type RateLimitVerdict =
  | { allowed: true }
  | {
      allowed: false
      /** За какой период исчерпан лимит — от этого зависит текст. */
      window: 'hour' | 'day'
      limit: number
      /** Через сколько минут можно повторить. */
      retryAfterMinutes: number
    }

export function checkRateLimit(
  previousAt: readonly number[],
  now: number,
  limits: RateLimits,
): RateLimitVerdict {
  const inHour = previousAt.filter((t) => now - t < MS_PER_HOUR)
  if (inHour.length >= limits.postsPerHour) {
    const oldest = Math.min(...inHour)
    return {
      allowed: false,
      window: 'hour',
      limit: limits.postsPerHour,
      retryAfterMinutes: Math.max(1, Math.ceil((MS_PER_HOUR - (now - oldest)) / 60_000)),
    }
  }

  const inDay = previousAt.filter((t) => now - t < MS_PER_DAY)
  if (inDay.length >= limits.postsPerDay) {
    const oldest = Math.min(...inDay)
    return {
      allowed: false,
      window: 'day',
      limit: limits.postsPerDay,
      retryAfterMinutes: Math.max(1, Math.ceil((MS_PER_DAY - (now - oldest)) / 60_000)),
    }
  }

  return { allowed: true }
}

/** «через 2 ч 15 мин» — человеку нужно знать, сколько ждать, а не код ошибки. */
export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}
