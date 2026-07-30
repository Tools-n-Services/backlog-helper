'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  addChange,
  changeKinds,
  createRelease,
  deleteRelease,
  linkReleasePosts,
  removeChange,
  searchReleaseCandidates,
  unlinkReleasePost,
  updateRelease,
  type ChangeKindKey,
  type ReleaseOutcome,
} from '@/core/domain/changelog/mutations'
import { publishRelease, type PublishOutcome } from '@/core/domain/changelog/releases'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Составление и публикация релиза (FR-161..166).
 *
 * Права разные, и разница осмысленная: писать запись может вся команда,
 * а публиковать — администратор. Публикация рассылает письма всем, кто
 * голосовал, и отозвать их нельзя; черновик же можно переписать сколько
 * угодно раз.
 */

type Result = PublishOutcome | { ok: false; reason: 'forbidden' }
type EditResult = ReleaseOutcome | { ok: false; reason: 'forbidden' }

/** Составлять записи может та же команда, что ведёт бэклог. */
async function editor() {
  const viewer = await getViewer()
  return can(viewer, 'triage.decide') ? viewer : null
}

/** Момент из поля `datetime-local`: пусто — публикуем руками, без срока. */
function readMoment(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function createReleaseAction(formData: FormData): Promise<void> {
  const viewer = await editor()
  if (!viewer) return

  const result = await createRelease({
    title: String(formData.get('title') ?? ''),
    version: String(formData.get('version') ?? '') || null,
    lead: String(formData.get('lead') ?? ''),
    scheduledFor: readMoment(formData.get('scheduledFor')),
  })
  if (!result.ok) return

  revalidatePath('/admin/releases')
  redirect(`/admin/releases/${result.id}` as Route)
}

export async function updateReleaseAction(id: string, formData: FormData): Promise<void> {
  const viewer = await editor()
  if (!viewer) return

  await updateRelease(id, {
    title: String(formData.get('title') ?? ''),
    version: String(formData.get('version') ?? '') || null,
    lead: String(formData.get('lead') ?? ''),
    scheduledFor: readMoment(formData.get('scheduledFor')),
  })

  revalidatePath(`/admin/releases/${id}`)
  revalidatePath('/admin/releases')
}

export async function addChangeAction(
  entryId: string,
  formData: FormData,
): Promise<EditResult> {
  const viewer = await editor()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const kind = String(formData.get('kind') ?? 'new')
  const result = await addChange(entryId, {
    kind: changeKinds.some((k) => k.key === kind) ? (kind as ChangeKindKey) : 'new',
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  })

  if (result.ok) revalidatePath(`/admin/releases/${entryId}`)
  return result
}

export async function removeChangeAction(
  entryId: string,
  changeId: string,
): Promise<EditResult> {
  const viewer = await editor()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await removeChange(changeId)
  revalidatePath(`/admin/releases/${entryId}`)
  return { ok: true, id: entryId }
}

export async function linkReleasePostAction(
  entryId: string,
  postId: string,
): Promise<EditResult> {
  const viewer = await editor()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await linkReleasePosts(entryId, [postId])
  revalidatePath(`/admin/releases/${entryId}`)
  return { ok: true, id: entryId }
}

export async function unlinkReleasePostAction(
  entryId: string,
  postId: string,
): Promise<EditResult> {
  const viewer = await editor()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await unlinkReleasePost(entryId, postId)
  revalidatePath(`/admin/releases/${entryId}`)
  return { ok: true, id: entryId }
}

export async function searchReleaseCandidatesAction(entryId: string, query: string) {
  const viewer = await editor()
  if (!viewer) return []
  return searchReleaseCandidates(entryId, query)
}

export async function deleteReleaseAction(id: string): Promise<void> {
  const viewer = await editor()
  if (!viewer) return

  const result = await deleteRelease(id)
  if (!result.ok) return

  revalidatePath('/admin/releases')
  redirect('/admin/releases')
}

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
