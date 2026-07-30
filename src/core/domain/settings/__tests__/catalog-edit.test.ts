/**
 * Запреты на правку справочников (В5).
 *
 * Проверяется не «сохранилось», а то, что нельзя сохранить: удалить доску
 * с обращениями, оставить портал без начального статуса, завести два ключа
 * подряд. Это единственная защита данных от человека с правами
 * администратора и уставшими глазами.
 */

import assert from 'node:assert/strict'
import { afterAll, describe, it } from 'vitest'

import { invalidateCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'
import { saveBoards, saveStatuses } from '@/core/domain/settings/catalog-edit'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.board.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

async function currentBoards() {
  const rows = await prisma.board.findMany({ orderBy: { position: 'asc' } })
  return rows.map((b) => ({
    slug: b.slug,
    name: b.name,
    nameEn: b.nameEn ?? undefined,
    description: b.description,
    descriptionEn: b.descriptionEn ?? undefined,
    visibility: b.visibility,
    hiddenFromNav: b.hiddenFromNav,
    requireCategory: b.requireCategory,
  }))
}

async function currentStatuses() {
  const rows = await prisma.status.findMany({ orderBy: { position: 'asc' } })
  return rows.map((s) => ({
    key: s.key,
    name: s.name,
    nameEn: s.nameEn ?? undefined,
    color: s.color,
    shape: s.shape as 'dot',
    showOnRoadmap: s.showOnRoadmap,
    isTerminal: s.isTerminal,
    isDefault: s.isDefault,
  }))
}

suite('правка справочников', () => {
  afterAll(() => {
    invalidateCatalog()
  })

  it('доску с обращениями удалить нельзя', async () => {
    const boards = await currentBoards()
    const busy = await prisma.board.findFirst({ where: { postCount: { gt: 0 } } })
    assert.ok(busy, 'для проверки нужна доска с обращениями')

    const result = await saveBoards(boards.filter((b) => b.slug !== busy.slug))
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.error, /не пустая/)

    /* И она на месте: отказ обязан быть отказом, а не половиной работы. */
    assert.ok(await prisma.board.findUnique({ where: { slug: busy.slug } }))
  })

  it('портал без досок невозможен', async () => {
    const result = await saveBoards([])
    assert.equal(result.ok, false)
  })

  it('повторяющийся адрес доски отклоняется', async () => {
    const boards = await currentBoards()
    const first = boards[0]!
    const result = await saveBoards([...boards, { ...first, name: 'Копия' }])
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.error, /повторяется/)
  })

  it('переименование доски сохраняется, адрес остаётся прежним', async () => {
    const boards = await currentBoards()
    const target = boards[0]!
    const saved = await saveBoards(
      boards.map((b) => (b.slug === target.slug ? { ...b, name: 'Проверка правки' } : b)),
    )
    assert.equal(saved.ok, true)

    const row = await prisma.board.findUniqueOrThrow({ where: { slug: target.slug } })
    assert.equal(row.name, 'Проверка правки')

    await saveBoards(boards)
    const restored = await prisma.board.findUniqueOrThrow({ where: { slug: target.slug } })
    assert.equal(restored.name, target.name)
  })

  it('начальный статус должен быть ровно один', async () => {
    const statuses = await currentStatuses()

    const none = await saveStatuses(statuses.map((s) => ({ ...s, isDefault: false })))
    assert.equal(none.ok, false)

    const two = await saveStatuses(statuses.map((s) => ({ ...s, isDefault: true })))
    assert.equal(two.ok, false)
  })

  it('цвет — только из палитры', async () => {
    const statuses = await currentStatuses()
    const result = await saveStatuses(
      statuses.map((s, i) => (i === 0 ? { ...s, color: '#ff0000' } : s)),
    )
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.error, /палитры/)
  })

  it('статус с обращениями удалить нельзя', async () => {
    const statuses = await currentStatuses()
    /* Не начальный: убрав его, мы получили бы сразу две ошибки, и проверка
       перестала бы проверять именно занятость. */
    const busy = await prisma.status.findFirst({
      where: { posts: { some: {} }, isDefault: false },
      select: { key: true },
    })
    assert.ok(busy, 'для проверки нужен непустой статус, не начальный')

    const result = await saveStatuses(statuses.filter((s) => s.key !== busy.key))
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.error, /есть обращения/)
  })
})
