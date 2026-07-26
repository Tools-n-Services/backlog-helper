'use server'

import { cookies } from 'next/headers'

import { product } from '@config/product'
import { postTypeByKey } from '@config/post-types'
import { checkRateLimit } from '@/core/domain/intake/rate-limit'
import {
  hasErrors,
  validateSubmission,
  type FieldErrors,
  type FormValues,
} from '@/core/domain/intake/validate'
import { queries } from '@/queries'
import type { SimilarPostView } from '@/queries/types'

const SESSION_COOKIE = 'intake-session'

/**
 * Отметки о недавних отправках. ЗАГЛУШКА ФАЗЫ A: живёт в памяти процесса.
 * В фазе B это строки в БД, а сам `checkRateLimit` не меняется — он и есть
 * правило, а здесь только его хранилище.
 */
const submissionsBySession = new Map<string, number[]>()

async function sessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(SESSION_COOKIE)?.value
  if (existing) return existing
  const fresh = crypto.randomUUID()
  jar.set(SESSION_COOKIE, fresh, { httpOnly: true, sameSite: 'lax', path: '/' })
  return fresh
}

/** Поиск похожих на вводе заголовка (FR-122). */
export async function searchSimilar(
  boardSlug: string,
  typeKey: string,
  title: string,
): Promise<SimilarPostView[]> {
  return queries.findSimilar({ boardSlug, typeKey, title })
}

export type SubmitResult =
  | { ok: true; ref: string; moderated: boolean }
  | { ok: false; kind: 'validation'; errors: FieldErrors }
  | {
      ok: false
      kind: 'rate-limit'
      window: 'hour' | 'day'
      limit: number
      retryAfterMinutes: number
    }

/**
 * Отправка обращения.
 *
 * В фазе A запись никуда не сохраняется — создание постов появится в B2.
 * Но проверки здесь настоящие: схема типа и лимиты работают ровно так,
 * как будут работать потом.
 */
export async function submitPost(
  boardSlug: string,
  typeKey: string,
  values: FormValues,
): Promise<SubmitResult> {
  const type = postTypeByKey.get(typeKey)
  const board = await queries.getBoard(boardSlug)
  if (!type || !board) {
    return { ok: false, kind: 'validation', errors: { title: 'Неизвестная доска или тип' } }
  }

  const errors = validateSubmission(type, values, {
    requireCategory: board.requireCategory,
  })
  if (hasErrors(errors)) return { ok: false, kind: 'validation', errors }

  const session = await sessionId()
  const now = Date.now()
  const previous = submissionsBySession.get(session) ?? []
  const verdict = checkRateLimit(previous, now, {
    postsPerHour: product.limits.postsPerHour,
    postsPerDay: product.limits.postsPerDay,
  })

  if (!verdict.allowed) {
    return {
      ok: false,
      kind: 'rate-limit',
      window: verdict.window,
      limit: verdict.limit,
      retryAfterMinutes: verdict.retryAfterMinutes,
    }
  }

  submissionsBySession.set(session, [...previous, now])

  return {
    ok: true,
    ref: `RTM-${9000 + previous.length}`,
    /* Обращения от новых аккаунтов уходят в очередь модерации (FR-201). */
    moderated: true,
  }
}
