'use server'

import { revalidatePath } from 'next/cache'

import { publishRelease, type PublishOutcome } from '@/core/domain/changelog/releases'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Публикация релиза (FR-165).
 *
 * Полномочие проверяется здесь, а не только скрытием кнопки: публикация
 * рассылает письма всем, кто голосовал, и отозвать их нельзя.
 */

type Result = PublishOutcome | { ok: false; reason: 'forbidden' }

export async function publishReleaseAction(entryId: string): Promise<Result> {
  const viewer = await getViewer()
  if (!can(viewer, 'release.publish')) return { ok: false, reason: 'forbidden' }

  const result = await publishRelease(entryId, viewer.id)
  if (result.ok) {
    revalidatePath('/admin/releases')
    /* Запись появилась в changelog, связанные обращения сменили статус —
       публичный кэш больше не верен, а ссылка из письма ведёт именно туда. */
    revalidatePath('/', 'layout')
  }
  return result
}
