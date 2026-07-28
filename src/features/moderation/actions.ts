'use server'

import { revalidatePath } from 'next/cache'

import { approvePost, rejectPost, type ModerationOutcome } from '@/core/domain/post/mutations'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Модерация обращений (FR-201).
 *
 * Полномочие проверяется здесь: очередь модерации решает, что увидят все
 * остальные, и «кнопки нет» — не защита.
 */

type Result = ModerationOutcome | { ok: false; reason: 'forbidden' }

async function moderator() {
  const viewer = await getViewer()
  return can(viewer, 'moderation.review') ? viewer : null
}

export async function approveAction(postId: string): Promise<Result> {
  const viewer = await moderator()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const result = await approvePost(postId, viewer.id)
  if (result.ok) {
    revalidatePath('/admin/moderation')
    /* Обращение появилось в ленте — её кэш больше не верен. */
    revalidatePath('/', 'layout')
  }
  return result
}

export async function rejectAction(postId: string, reason: string): Promise<Result> {
  const viewer = await moderator()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const result = await rejectPost(postId, viewer.id, reason)
  if (result.ok) revalidatePath('/admin/moderation')
  return result
}
