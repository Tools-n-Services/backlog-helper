/**
 * Составление записи changelog (FR-161..166).
 *
 * Публикация умела закрывать обращения и рассылать письма и до этого, но
 * саму запись брать было неоткуда: она приходила сидом или импортом. Экран,
 * на котором есть кнопка «Опубликовать» и нет способа завести то, что она
 * публикует, — это обещание без второй половины.
 *
 * Запись собирается из отдельных изменений со своим типом у каждого, а не
 * одним markdown-блоком: иначе фильтр ленты по типу (FR-162) может отвечать
 * только «в этом релизе что-то чинили», но не показывать, что именно.
 */

import { prisma } from '@/core/db'
import { slugify } from '@/core/slug'

/* Список типов живёт отдельно и без зависимостей от инфраструктуры: его
   импортирует редактор в браузере, и тянуть за ним драйвер Postgres нельзя. */
export { changeKinds, changeKindName, type ChangeKindKey } from './kinds'

import type { ChangeKindKey } from './kinds'

export type ReleaseOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'title-required' | 'not-found' | 'already-published' }

export interface CreateReleaseInput {
  title: string
  version?: string | null
  lead?: string | null
  /** Отложенная публикация: воркер выпустит запись сам (FR-166). */
  scheduledFor?: Date | null
}

/**
 * Завести черновик релиза.
 *
 * Запись создаётся неопубликованной всегда: между «начал писать» и «люди
 * получили письма» должен быть отдельный осознанный шаг, иначе первая же
 * опечатка уходит подписчикам.
 */
export async function createRelease(input: CreateReleaseInput): Promise<ReleaseOutcome> {
  const title = input.title.trim()
  if (title.length < 3) return { ok: false, reason: 'title-required' }

  const version = input.version?.trim() || null
  const entry = await prisma.changelogEntry.create({
    data: {
      title,
      version,
      lead: input.lead?.trim() ?? '',
      slug: await uniqueSlug(version ? `release ${version}` : title),
      scheduledFor: input.scheduledFor ?? null,
    },
    select: { id: true },
  })

  return { ok: true, id: entry.id }
}

export interface UpdateReleaseInput {
  title?: string
  version?: string | null
  lead?: string
  labels?: string[]
  scheduledFor?: Date | null
}

/**
 * Правка полей записи.
 *
 * Адрес (`slug`) не меняется никогда, даже если заголовок переписали целиком:
 * на него уже ведут ссылки из писем о выпуске, а письмо отозвать нельзя.
 */
export async function updateRelease(
  id: string,
  input: UpdateReleaseInput,
): Promise<ReleaseOutcome> {
  const existing = await prisma.changelogEntry.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) return { ok: false, reason: 'not-found' }

  const title = input.title?.trim()
  if (title !== undefined && title.length < 3) return { ok: false, reason: 'title-required' }

  await prisma.changelogEntry.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(input.version !== undefined ? { version: input.version?.trim() || null } : {}),
      ...(input.lead !== undefined ? { lead: input.lead.trim() } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
      ...(input.scheduledFor !== undefined ? { scheduledFor: input.scheduledFor } : {}),
    },
  })

  return { ok: true, id }
}

export interface AddChangeInput {
  kind: ChangeKindKey
  title: string
  body?: string
}

export async function addChange(
  entryId: string,
  input: AddChangeInput,
): Promise<ReleaseOutcome> {
  const title = input.title.trim()
  if (title.length < 3) return { ok: false, reason: 'title-required' }

  const entry = await prisma.changelogEntry.findUnique({
    where: { id: entryId },
    select: { id: true, _count: { select: { changes: true } } },
  })
  if (!entry) return { ok: false, reason: 'not-found' }

  await prisma.changelogChange.create({
    data: {
      entryId: entry.id,
      kind: input.kind,
      title,
      body: input.body?.trim() ?? '',
      position: entry._count.changes,
    },
  })

  await syncTypes(entry.id)
  return { ok: true, id: entry.id }
}

export async function removeChange(changeId: string): Promise<void> {
  const change = await prisma.changelogChange.findUnique({
    where: { id: changeId },
    select: { entryId: true },
  })
  if (!change) return

  await prisma.changelogChange.delete({ where: { id: changeId } })
  await syncTypes(change.entryId)
}

/**
 * Набор типов записи — производное поле, денормализованное для фильтра ленты.
 *
 * Пересчитывается из самих изменений после каждой правки: список типов,
 * который живёт отдельной жизнью от списка изменений, однажды покажет
 * в фильтре «исправлено» запись, где исправлений нет.
 */
async function syncTypes(entryId: string): Promise<void> {
  const changes = await prisma.changelogChange.findMany({
    where: { entryId },
    select: { kind: true },
  })
  await prisma.changelogEntry.update({
    where: { id: entryId },
    data: { types: [...new Set(changes.map((c) => c.kind))] },
  })
}

/** Привязать обращения, которые закроет публикация (FR-165). */
export async function linkReleasePosts(entryId: string, postIds: string[]): Promise<number> {
  if (postIds.length === 0) return 0
  const result = await prisma.changelogPost.createMany({
    data: postIds.map((postId) => ({ entryId, postId })),
    skipDuplicates: true,
  })
  return result.count
}

export async function unlinkReleasePost(entryId: string, postId: string): Promise<void> {
  await prisma.changelogPost.deleteMany({ where: { entryId, postId } })
}

/**
 * Кандидаты на привязку к релизу.
 *
 * Закрытые обращения из выдачи не убираются: релиз часто выходит уже после
 * того, как обращение перевели в «Выполнено» руками, и не дать его привязать
 * значило бы оставить человека без письма «то, что вы просили, вышло».
 */
export async function searchReleaseCandidates(
  entryId: string,
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
      changelogLinks: { none: { entryId } },
    },
    orderBy: { voteCount: 'desc' },
    take: limit,
    select: { id: true, title: true, voteCount: true, board: { select: { name: true } } },
  })

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    boardName: r.board.name,
    voteCount: r.voteCount,
  }))
}

/**
 * Удалить черновик.
 *
 * Только неопубликованный: у вышедшей записи есть адрес, по которому ходят
 * из писем, и переходы в истории обращений, которые ссылаются на неё.
 */
export async function deleteRelease(id: string): Promise<ReleaseOutcome> {
  const entry = await prisma.changelogEntry.findUnique({
    where: { id },
    select: { id: true, publishedAt: true },
  })
  if (!entry) return { ok: false, reason: 'not-found' }
  if (entry.publishedAt) return { ok: false, reason: 'already-published' }

  await prisma.changelogEntry.delete({ where: { id } })
  return { ok: true, id }
}

/**
 * Свободный адрес записи.
 *
 * Версии повторяются чаще, чем кажется: «2.31» после отменённого релиза
 * заводят второй раз. Столкновение уникального индекса на `slug` в этот
 * момент выглядело бы как «сохранить не удалось» без объяснения.
 */
async function uniqueSlug(source: string): Promise<string> {
  const base = slugify(source) || 'release'
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const taken = await prisma.changelogEntry.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!taken) return slug
  }
  /* Пятьдесят записей с одним заголовком — уже не совпадение, а цикл
     в вызывающем коде: лучше упасть здесь, чем молча писать мимо. */
  throw new Error(`Не удалось подобрать свободный адрес для записи «${source}»`)
}
