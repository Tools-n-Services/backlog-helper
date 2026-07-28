'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { BacklogKindKey } from '@config/internal-statuses'
import { backlogKinds } from '@config/internal-statuses'
import {
  createBacklogItem,
  createFromPost,
  linkPosts,
  searchLinkCandidates,
  unlinkPost,
  updateBacklogItem,
  type BacklogOutcome,
} from '@/core/domain/backlog/mutations'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Действия бэклога.
 *
 * Право то же, что у триажа: бэклог ведёт та же команда, которая разбирает
 * очередь. Отдельного полномочия под него нет — оно появится, когда появится
 * роль, которой можно разбирать обращения, но нельзя планировать работу.
 * Пока такой роли нет, лишний уровень только запутает.
 */
async function planner() {
  const viewer = await getViewer()
  return can(viewer, 'triage.decide') ? viewer : null
}

type Result = BacklogOutcome | { ok: false; reason: 'forbidden' }

/** Тип работы из формы. Незнакомое значение — «функция», а не падение. */
function readKind(value: FormDataEntryValue | null): BacklogKindKey {
  const key = String(value ?? '')
  return backlogKinds.some((k) => k.key === key) ? (key as BacklogKindKey) : 'feature'
}

export async function createItemAction(formData: FormData): Promise<void> {
  const viewer = await planner()
  if (!viewer) return

  const result = await createBacklogItem({
    title: String(formData.get('title') ?? ''),
    problem: String(formData.get('problem') ?? ''),
    kind: readKind(formData.get('kind')),
    themeId: String(formData.get('themeId') ?? '') || null,
    parentId: String(formData.get('parentId') ?? '') || null,
    ownerId: viewer.id,
  })

  if (!result.ok) return
  revalidatePath('/admin/backlog')
  redirect(`/admin/backlog/${result.id}` as Route)
}

/** Завести работу из обращения (FR-603): решение триажа «в бэклог». */
export async function createFromPostAction(postId: string): Promise<Result> {
  const viewer = await planner()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const result = await createFromPost(postId, viewer.id)
  if (result.ok) revalidatePath('/admin/backlog')
  return result
}

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  const viewer = await planner()
  if (!viewer) return

  await updateBacklogItem(id, {
    title: String(formData.get('title') ?? ''),
    problem: String(formData.get('problem') ?? ''),
    kind: readKind(formData.get('kind')),
    themeId: String(formData.get('themeId') ?? '') || null,
    estimate: String(formData.get('estimate') ?? ''),
    targetRelease: String(formData.get('targetRelease') ?? ''),
    internalStatusKey: String(formData.get('statusKey') ?? '') || null,
  })

  revalidatePath(`/admin/backlog/${id}`)
  revalidatePath('/admin/backlog')
}

export async function linkPostAction(itemId: string, postId: string): Promise<Result> {
  const viewer = await planner()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await linkPosts(itemId, [postId])
  revalidatePath(`/admin/backlog/${itemId}`)
  return { ok: true, id: itemId }
}

export async function unlinkPostAction(itemId: string, postId: string): Promise<Result> {
  const viewer = await planner()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await unlinkPost(itemId, postId)
  revalidatePath(`/admin/backlog/${itemId}`)
  return { ok: true, id: itemId }
}

export async function searchCandidatesAction(itemId: string, query: string) {
  const viewer = await planner()
  if (!viewer) return []
  return searchLinkCandidates(itemId, query)
}
