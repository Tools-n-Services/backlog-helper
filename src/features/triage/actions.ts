'use server'

import { revalidatePath } from 'next/cache'

import {
  applyDecision,
  assignPost,
  mergePosts,
  setPriority,
  type DecisionOutcome,
  type MergeOutcome,
} from '@/core/domain/triage/decisions'
import { catalog, loadCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'
import { can, type Permission } from '@/core/permissions'
import { getViewer } from '@/core/session'

/**
 * Действия очереди триажа.
 *
 * Право проверяется здесь, а не только скрытием кнопок: очередь — это
 * поверхность, где одно нажатие меняет публичный статус и рассылает письма.
 */

async function allowedTo(permission: Permission) {
  const viewer = await getViewer()
  return can(viewer, permission) ? viewer : null
}

export async function decideAction(
  postId: string,
  decisionKey: string,
  reason: string,
): Promise<DecisionOutcome | { ok: false; reason: 'forbidden' }> {
  const viewer = await allowedTo('triage.decide')
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const result = await applyDecision(postId, decisionKey, viewer.id, reason)
  if (result.ok) revalidatePath('/admin/triage')
  return result
}

export async function assignAction(
  postId: string,
  assigneeId: string | null,
): Promise<{ ok: boolean }> {
  const viewer = await allowedTo('triage.decide')
  if (!viewer) return { ok: false }

  await assignPost(postId, assigneeId)
  revalidatePath('/admin/triage')
  return { ok: true }
}

export async function priorityAction(
  postId: string,
  priority: string | null,
): Promise<{ ok: boolean }> {
  const viewer = await allowedTo('triage.decide')
  if (!viewer) return { ok: false }

  await setPriority(postId, priority)
  revalidatePath('/admin/triage')
  return { ok: true }
}

export interface MergeCandidate {
  id: string
  ref: string
  title: string
  boardName: string
  voteCount: number
  statusName: string
}

/**
 * Куда можно объединить это обращение.
 *
 * Поиск по названию и номеру: номер называют в переписке, и вставить его —
 * самый быстрый способ указать цель. Смерженные исключены — цепочки
 * указателей запрещены, и предлагать их было бы приглашением их создать.
 */
export async function mergeCandidatesAction(
  sourceId: string,
  search: string,
): Promise<MergeCandidate[]> {
  const viewer = await allowedTo('post.merge')
  if (!viewer) return []

  const query = search.trim()
  if (query.length < 2) return []

  const rows = await prisma.post.findMany({
    where: {
      id: { not: sourceId },
      mergedIntoId: null,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { ref: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { voteCount: 'desc' },
    take: 6,
    select: {
      id: true,
      ref: true,
      title: true,
      voteCount: true,
      board: { select: { name: true } },
      status: { select: { key: true } },
    },
  })

  await loadCatalog()
  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    boardName: r.board.name,
    voteCount: r.voteCount,
    statusName: catalog().statusByKey.get(r.status.key)?.name ?? r.status.key,
  }))
}

export async function mergeAction(
  sourceId: string,
  targetId: string,
): Promise<MergeOutcome | { ok: false; reason: 'forbidden' }> {
  /* Объединение — уровень администратора: оно переносит голоса
     и комментарии и без журнала практически необратимо. */
  const viewer = await allowedTo('post.merge')
  if (!viewer) return { ok: false, reason: 'forbidden' }

  const result = await mergePosts(sourceId, targetId, viewer.id)
  if (result.ok) revalidatePath('/admin/triage')
  return result
}
