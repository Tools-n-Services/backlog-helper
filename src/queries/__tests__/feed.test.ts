/**
 * Тесты контракта ленты. Написаны против @/queries, а не против моков:
 * читается на настоящих данных из Postgres.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { queries } from '@/queries'
import type { FeedQuery } from '@/queries/types'

const base = (over: Partial<FeedQuery> = {}): FeedQuery => ({
  boardSlug: 'product',
  sort: 'trending',
  statusKeys: [],
  typeKeys: [],
  categorySlugs: [],
  search: '',
  ...over,
})

describe('лента', () => {
  it('отдаёт страницу и курсор, а не весь список', async () => {
    const page = await queries.getFeed(base({ limit: 5 }))
    assert.equal(page.items.length, 5)
    assert.ok(page.nextCursor, 'должен быть курсор на продолжение')
    assert.ok(page.total > 5)
  })

  it('курсор продолжает выборку без дублей и пропусков', async () => {
    const first = await queries.getFeed(base({ limit: 5 }))
    const second = await queries.getFeed(
      base({ limit: 5, cursor: first.nextCursor ?? undefined }),
    )
    const ids = [...first.items, ...second.items].map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, 'страницы не должны пересекаться')

    const whole = await queries.getFeed(base({ limit: 10 }))
    assert.deepEqual(ids, whole.items.map((p) => p.id))
  })

  it('доходит до конца ленты и обнуляет курсор', async () => {
    let cursor: string | undefined
    const seen: string[] = []
    for (let guard = 0; guard < 50; guard++) {
      const page: Awaited<ReturnType<typeof queries.getFeed>> =
        await queries.getFeed(base({ limit: 7, cursor }))
      seen.push(...page.items.map((p) => p.id))
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }
    const all = await queries.getFeed(base({ limit: 1000 }))
    assert.equal(seen.length, all.total)
    assert.equal(new Set(seen).size, all.total)
  })

  it('фильтрует по статусу и типу одновременно', async () => {
    const page = await queries.getFeed(
      base({ statusKeys: ['open'], typeKeys: ['idea'], limit: 100 }),
    )
    assert.ok(page.items.length > 0)
    for (const item of page.items) {
      assert.equal(item.status.key, 'open')
      assert.equal(item.type.key, 'idea')
    }
  })

  it('счётчик фильтра совпадает с числом отфильтрованных обращений', async () => {
    const unfiltered = await queries.getFeed(base({ limit: 1000 }))
    const planned = unfiltered.facets.statuses.find((f) => f.key === 'planned')
    assert.ok(planned)
    const filtered = await queries.getFeed(
      base({ statusKeys: ['planned'], limit: 1000 }),
    )
    assert.equal(filtered.total, planned.count)
  })

  it('счётчики других измерений не обнуляются выбранным фильтром', async () => {
    const filtered = await queries.getFeed(
      base({ statusKeys: ['open'], limit: 1000 }),
    )
    const totalTypes = filtered.facets.types.reduce((s, f) => s + f.count, 0)
    assert.ok(totalTypes > 0, 'иначе панель фильтров показывает нули и бесполезна')
  })

  it('trending ставит свежие голоса выше старых накоплений', async () => {
    const top = await queries.getFeed(base({ sort: 'top', limit: 50 }))
    const trending = await queries.getFeed(base({ sort: 'trending', limit: 50 }))

    assert.notEqual(
      top.items.map((p) => p.id).join(),
      trending.items.map((p) => p.id).join(),
      'если порядок совпал целиком, затухание не работает',
    )

    /* Проверяется само свойство затухания, а не первое место: у двух лидеров
       доли свежих голосов почти равны, и кто из них наверху — вопрос
       случайного разброса дат, а не работы формулы. Настоящий признак —
       обгон: обращение с меньшим числом голосов стоит выше того, у кого
       их больше, потому что набрало их недавно. */
    const rows = trending.items.filter((p) => !p.pinned)
    const overtakes = rows.some((row, i) =>
      rows.slice(i + 1).some((below) => row.count < below.count),
    )
    assert.ok(overtakes, 'ни одно свежее обращение не обогнало более популярное')
  })

  it('закреплённые обращения всегда сверху', async () => {
    for (const sort of ['trending', 'top', 'new'] as const) {
      const page = await queries.getFeed(base({ sort, limit: 50 }))
      const firstUnpinned = page.items.findIndex((p) => !p.pinned)
      const lastPinned = page.items.map((p) => p.pinned).lastIndexOf(true)
      if (lastPinned !== -1) assert.ok(lastPinned < firstUnpinned, `нарушено при sort=${sort}`)
    }
  })

  it('вопросы не попадают в публичную ленту', async () => {
    const page = await queries.getFeed(base({ limit: 1000 }))
    assert.ok(page.items.every((p) => p.type.key !== 'question'))
  })

  it('поиск ищет по заголовку и телу', async () => {
    const page = await queries.getFeed(base({ search: 'праздник', limit: 100 }))
    assert.ok(page.items.length > 0)
  })

  it('несуществующий статус даёт пустую ленту, а не падение', async () => {
    const page = await queries.getFeed(base({ statusKeys: ['нет-такого'], limit: 10 }))
    assert.equal(page.items.length, 0)
    assert.equal(page.total, 0)
    assert.equal(page.nextCursor, null)
  })
})
