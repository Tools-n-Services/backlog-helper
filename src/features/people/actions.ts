'use server'

import { revalidatePath } from 'next/cache'

import {
  banPerson,
  setAccessRole,
  unbanPerson,
  type ManageOutcome,
} from '@/core/domain/people/manage'
import type { AccessRole } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Управление людьми.
 *
 * Полномочия и старшинство проверяет домен: интерфейс лишь не показывает
 * недоступные действия, а это не защита — форму можно отправить и мимо него.
 */

type Result = ManageOutcome | { ok: false; reason: 'unauthorized' }

async function actor() {
  const viewer = await getViewer()
  if (!viewer.signedIn) return null
  return viewer
}

export async function setRoleAction(userId: string, role: AccessRole): Promise<Result> {
  const viewer = await actor()
  if (!viewer) return { ok: false, reason: 'unauthorized' }

  const result = await setAccessRole(viewer, userId, role)
  if (result.ok) revalidatePath('/admin/people')
  return result
}

export async function banAction(userId: string, reason: string): Promise<Result> {
  const viewer = await actor()
  if (!viewer) return { ok: false, reason: 'unauthorized' }

  const result = await banPerson(viewer, userId, reason)
  if (result.ok) revalidatePath('/admin/people')
  return result
}

export async function unbanAction(userId: string): Promise<Result> {
  const viewer = await actor()
  if (!viewer) return { ok: false, reason: 'unauthorized' }

  const result = await unbanPerson(viewer, userId)
  if (result.ok) revalidatePath('/admin/people')
  return result
}
