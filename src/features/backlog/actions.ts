'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { BacklogKindKey } from '@config/internal-statuses'
import { backlogKinds } from '@config/internal-statuses'
import {
  addInsight,
  insightSources,
  removeInsight,
  type InsightOutcome,
  type InsightSourceKey,
} from '@/core/domain/backlog/insights'
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

/**
 * Число из формы. Пустое поле — это null, а не ноль.
 *
 * Разница принципиальна для приоритета: null значит «не оценено» и уводит
 * работу в конец списка на оценку, а ноль — оценку «ничего не даст».
 */
function readNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

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
    decisionReasonPublic: String(formData.get('decisionReasonPublic') ?? ''),
    impact: readNumber(formData.get('impact')),
    confidence: readNumber(formData.get('confidence')),
    effort: readNumber(formData.get('effort')),
    /* Кто перевёл этап — он же автор смены публичного статуса в истории
       связанных обращений: смену видно на публичной странице, и «изменено
       системой» там читается как сбой. */
    actorId: viewer.id,
  })

  revalidatePath(`/admin/backlog/${id}`)
  revalidatePath('/admin/backlog')
  /* Смена этапа могла перевести связанные обращения: их публичные страницы
     и лента обязаны показать это сразу, иначе человек, которому уже ушло
     письмо, откроет ссылку и увидит прежний статус. */
  revalidatePath('/', 'layout')
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

/** Добавить цитату к работе (FR-622). */
export async function addInsightAction(
  itemId: string,
  formData: FormData,
): Promise<InsightOutcome | { ok: false; reason: 'forbidden' }> {
  const viewer = await planner()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const source = String(formData.get('source') ?? 'other')
  const result = await addInsight({
    backlogItemId: itemId,
    quote: String(formData.get('quote') ?? ''),
    source: insightSources.some((s) => s.key === source)
      ? (source as InsightSourceKey)
      : 'other',
    companyId: String(formData.get('companyId') ?? '') || null,
    authorEmail: String(formData.get('authorEmail') ?? '') || null,
    sourceUrl: String(formData.get('sourceUrl') ?? '') || null,
  })

  if (result.ok) revalidatePath(`/admin/backlog/${itemId}`)
  return result
}

export async function removeInsightAction(itemId: string, insightId: string): Promise<Result> {
  const viewer = await planner()
  if (!viewer) return { ok: false, reason: 'forbidden' }

  await removeInsight(insightId)
  revalidatePath(`/admin/backlog/${itemId}`)
  return { ok: true, id: itemId }
}
