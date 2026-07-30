/**
 * Правка справочников из админки (В5, docs/09-install.md).
 *
 * Здесь живут запреты, которые нельзя оставить подсказкой в интерфейсе:
 * человек, который переименует ключ статуса или удалит доску с обращениями,
 * узнает о последствиях не от нас, а от пользователей.
 *
 * Правило простое: то, на что ссылаются данные, не меняется и не исчезает.
 * `slug` доски стоит в каждой ссылке на обращение, `key` статуса — в истории
 * переходов и в маппинге внутренних этапов. Переименовать подпись можно
 * всегда, идентификатор — никогда.
 */

import { invalidateCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'
import { paletteByKey } from '@config/theme'
import type { StatusShape } from '@config/statuses'

/** Ключ и slug: латиница, цифры, дефис. Они попадают в адреса. */
const KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

export interface BoardInput {
  slug: string
  name: string
  nameEn?: string
  description: string
  descriptionEn?: string
  visibility: 'public' | 'private' | 'readonly'
  hiddenFromNav: boolean
  requireCategory: boolean
}

export interface StatusInput {
  key: string
  name: string
  nameEn?: string
  color: string
  shape: StatusShape
  showOnRoadmap: boolean
  isTerminal: boolean
  isDefault: boolean
}

export type EditResult = { ok: true } | { ok: false; error: string }

/**
 * Сохранить набор досок.
 *
 * Порядок в списке становится порядком в навигации. Доска, которой нет
 * в списке, удаляется — но только пустая: обращения ссылаются на неё
 * и адресом, и внешним ключом.
 */
export async function saveBoards(boards: BoardInput[]): Promise<EditResult> {
  if (boards.length === 0) {
    return { ok: false, error: 'Хотя бы одна доска нужна: обращения должны куда-то приходить' }
  }

  const slugs = new Set<string>()
  for (const board of boards) {
    if (!KEY_PATTERN.test(board.slug)) {
      return { ok: false, error: `Адрес «${board.slug}»: латиница, цифры и дефис` }
    }
    if (slugs.has(board.slug)) {
      return { ok: false, error: `Адрес «${board.slug}» повторяется` }
    }
    slugs.add(board.slug)
    if (!board.name.trim()) return { ok: false, error: 'Название доски не может быть пустым' }
  }

  const existing = await prisma.board.findMany({
    select: { id: true, slug: true, postCount: true },
  })
  const gone = existing.filter((b) => !slugs.has(b.slug))
  const busy = gone.find((b) => b.postCount > 0)
  if (busy) {
    return {
      ok: false,
      error: `Доска «${busy.slug}» не пустая: в ней есть обращения. Скройте её из навигации вместо удаления`,
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, board] of boards.entries()) {
      const data = {
        name: board.name.trim(),
        nameEn: board.nameEn?.trim() || null,
        description: board.description.trim(),
        descriptionEn: board.descriptionEn?.trim() || null,
        visibility: board.visibility,
        hiddenFromNav: board.hiddenFromNav,
        requireCategory: board.requireCategory,
        position: index,
      }
      await tx.board.upsert({
        where: { slug: board.slug },
        update: data,
        create: { slug: board.slug, ...data },
      })
    }
    for (const board of gone) {
      await tx.board.delete({ where: { id: board.id } })
    }
  })

  invalidateCatalog()
  return { ok: true }
}

/**
 * Сохранить набор статусов.
 *
 * Статус с обращениями не удаляется: история переходов ссылается на него,
 * и «статуса больше нет» означало бы дыру в истории каждого обращения,
 * которое через него прошло.
 */
export async function saveStatuses(statuses: StatusInput[]): Promise<EditResult> {
  if (statuses.length === 0) {
    return { ok: false, error: 'Хотя бы один статус нужен: обращение всегда в каком-то из них' }
  }

  const keys = new Set<string>()
  for (const status of statuses) {
    if (!KEY_PATTERN.test(status.key)) {
      return { ok: false, error: `Ключ «${status.key}»: латиница, цифры и дефис` }
    }
    if (keys.has(status.key)) return { ok: false, error: `Ключ «${status.key}» повторяется` }
    keys.add(status.key)
    if (!status.name.trim()) return { ok: false, error: 'Название статуса не может быть пустым' }
    if (!paletteByKey.has(status.color)) {
      return { ok: false, error: `Цвет «${status.color}» не из палитры` }
    }
  }

  /* Ровно один начальный: ноль означает, что новое обращение некуда положить,
     два — что выбор между ними делается случайно. */
  const defaults = statuses.filter((s) => s.isDefault)
  if (defaults.length !== 1) {
    return { ok: false, error: 'Начальный статус должен быть ровно один' }
  }

  const existing = await prisma.status.findMany({
    select: { id: true, key: true, _count: { select: { posts: true } } },
  })
  const gone = existing.filter((s) => !keys.has(s.key))
  const busy = gone.find((s) => s._count.posts > 0)
  if (busy) {
    return {
      ok: false,
      error: `В статусе «${busy.key}» есть обращения: сначала переведите их в другой`,
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, status] of statuses.entries()) {
      const data = {
        name: status.name.trim(),
        nameEn: status.nameEn?.trim() || null,
        color: status.color,
        shape: status.shape,
        showOnRoadmap: status.showOnRoadmap,
        isTerminal: status.isTerminal,
        isDefault: status.isDefault,
        position: index,
      }
      await tx.status.upsert({
        where: { key: status.key },
        update: data,
        create: { key: status.key, ...data },
      })
    }
    for (const status of gone) {
      await tx.status.delete({ where: { id: status.id } })
    }
  })

  invalidateCatalog()
  return { ok: true }
}
