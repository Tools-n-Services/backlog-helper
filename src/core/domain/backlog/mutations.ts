/**
 * Работа с элементами бэклога (FR-601..608).
 *
 * Элемент бэклога — единица РАБОТЫ, а не обращение. Разделение центральное
 * для продукта (06-backlog.md, раздел 0): одну работу питают несколько
 * обращений, внутренняя формулировка отличается от публичной, а техдолг
 * конкурирует за приоритет наравне, не имея ни одного обращения вовсе.
 *
 * Поэтому создание элемента из обращения КОПИРУЕТ текст, а не ссылается
 * на него: дальше формулировки расходятся, и это нормально.
 */

import { defaultInternalStatus } from '@config/internal-statuses'
import { prisma } from '@/core/db'

/** Шаг ранга при добавлении в конец: место между соседями для перетаскивания. */
const RANK_STEP = 1000

export interface CreateBacklogItemInput {
  title: string
  problem?: string
  kind?: 'feature' | 'bug' | 'tech' | 'compliance'
  themeId?: string | null
  ownerId?: string | null
  parentId?: string | null
  estimate?: string | null
  targetRelease?: string | null
  /** Обращения, которые эта работа закрывает. */
  postIds?: string[]
}

export type BacklogOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'title-required' | 'not-found' }

export async function createBacklogItem(
  input: CreateBacklogItemInput,
): Promise<BacklogOutcome> {
  const title = input.title.trim()
  if (title.length < 3) return { ok: false, reason: 'title-required' }

  const status = await prisma.internalStatus.findUnique({
    where: { key: defaultInternalStatus.key },
    select: { id: true },
  })

  /* Фаза наследует тему родителя, если её не задали явно: иначе фильтр
     по теме теряет части крупной работы — а именно по нему и смотрят,
     сколько сил уходит в направление. */
  const themeId =
    input.themeId ??
    (input.parentId
      ? ((
          await prisma.backlogItem.findUnique({
            where: { id: input.parentId },
            select: { themeId: true },
          })
        )?.themeId ?? null)
      : null)

  const item = await prisma.backlogItem.create({
    data: {
      title,
      problem: input.problem?.trim() ?? '',
      kind: input.kind ?? 'feature',
      themeId,
      ownerId: input.ownerId ?? null,
      parentId: input.parentId ?? null,
      estimate: input.estimate?.trim() || null,
      targetRelease: input.targetRelease?.trim() || null,
      internalStatusId: status?.id ?? null,
      rank: await nextRank(),
    },
    select: { id: true },
  })

  if (input.postIds?.length) {
    await linkPosts(item.id, input.postIds)
  }

  return { ok: true, id: item.id }
}

/**
 * Создать работу из обращения (FR-603).
 *
 * Заголовок и проблема заполняются из обращения — но это отправная точка,
 * а не связь: команда переформулирует их своими словами, и расхождение
 * с публичным текстом ожидаемо.
 */
export async function createFromPost(
  postId: string,
  ownerId: string | null,
): Promise<BacklogOutcome> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { title: true, details: true, type: { select: { key: true } } },
  })
  if (!post) return { ok: false, reason: 'not-found' }

  return createBacklogItem({
    title: post.title,
    problem: post.details.split(/\n{2,}/)[0] ?? '',
    kind: post.type.key === 'bug' ? 'bug' : 'feature',
    ownerId,
    postIds: [postId],
  })
}

export interface UpdateBacklogItemInput {
  title?: string
  problem?: string
  kind?: 'feature' | 'bug' | 'tech' | 'compliance'
  themeId?: string | null
  ownerId?: string | null
  estimate?: string | null
  targetRelease?: string | null
  /** Ключ внутреннего статуса. Публичные статусы обращений он пока не трогает. */
  internalStatusKey?: string | null
}

export async function updateBacklogItem(
  id: string,
  input: UpdateBacklogItemInput,
): Promise<BacklogOutcome> {
  const existing = await prisma.backlogItem.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { ok: false, reason: 'not-found' }

  const title = input.title?.trim()
  if (title !== undefined && title.length < 3) return { ok: false, reason: 'title-required' }

  const statusId =
    input.internalStatusKey === undefined
      ? undefined
      : ((
          await prisma.internalStatus.findUnique({
            where: { key: input.internalStatusKey ?? '' },
            select: { id: true },
          })
        )?.id ?? null)

  await prisma.backlogItem.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(input.problem !== undefined ? { problem: input.problem.trim() } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.themeId !== undefined ? { themeId: input.themeId } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.estimate !== undefined ? { estimate: input.estimate?.trim() || null } : {}),
      ...(input.targetRelease !== undefined
        ? { targetRelease: input.targetRelease?.trim() || null }
        : {}),
      ...(statusId !== undefined ? { internalStatusId: statusId } : {}),
    },
  })

  return { ok: true, id }
}

/**
 * Привязать обращения к работе (FR-602).
 *
 * Связь N:M, и повторная привязка не ошибка: два человека могут прийти
 * к одному выводу одновременно.
 */
export async function linkPosts(itemId: string, postIds: string[]): Promise<number> {
  if (postIds.length === 0) return 0
  const result = await prisma.backlogPost.createMany({
    data: postIds.map((postId) => ({ backlogItemId: itemId, postId })),
    skipDuplicates: true,
  })
  return result.count
}

export async function unlinkPost(itemId: string, postId: string): Promise<void> {
  await prisma.backlogPost.deleteMany({
    where: { backlogItemId: itemId, postId },
  })
}

/**
 * Следующий ранг — в конец списка.
 *
 * Дробная индексация (FR-615): между соседями всегда остаётся место,
 * поэтому перетаскивание меняет одну строку, а не пересчитывает таблицу.
 */
async function nextRank(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT max("rank")::float8 AS max FROM "backlog_item"
  `
  return (row?.max ?? 0) + RANK_STEP
}

/**
 * Кандидаты на привязку: обращения, ещё не связанные с этой работой.
 *
 * Поиск по заголовку, а не полный список: обращений тысячи, и выбирать
 * из выпадающего списка на пятнадцать тысяч строк невозможно.
 */
export async function searchLinkCandidates(
  itemId: string,
  query: string,
  limit = 8,
): Promise<{ id: string; title: string; boardName: string; voteCount: number }[]> {
  const search = query.trim()
  if (search.length < 2) return []

  const rows = await prisma.post.findMany({
    where: {
      mergedIntoId: null,
      moderation: 'approved',
      title: { contains: search, mode: 'insensitive' },
      backlogLinks: { none: { backlogItemId: itemId } },
    },
    orderBy: { voteCount: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      voteCount: true,
      board: { select: { name: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    boardName: r.board.name,
    voteCount: r.voteCount,
  }))
}
