import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { statuses } from '@config/statuses'
import { queries } from '@/queries'

describe('роадмап', () => {
  it('колонками становятся ровно те статусы, что помечены в конфиге', async () => {
    const roadmap = await queries.getRoadmap()
    const expected = statuses
      .filter((s) => s.showOnRoadmap)
      .sort((a, b) => a.position - b.position)
      .map((s) => s.key)

    assert.deepEqual(
      roadmap.columns.map((c) => c.status.key),
      expected,
    )
  })

  it('агрегирует обращения со всех досок, а не с одной', async () => {
    const roadmap = await queries.getRoadmap()
    const boards = new Set(
      roadmap.columns.flatMap((c) => c.items.map((i) => i.boardSlug)),
    )
    assert.ok(boards.size > 1, 'роадмап обязан быть сквозным по доскам')
  })

  it('фильтр по доске сужает выборку', async () => {
    const only = await queries.getRoadmap('bugs')
    for (const column of only.columns) {
      for (const item of column.items) assert.equal(item.boardSlug, 'bugs')
    }

    const all = await queries.getRoadmap()
    const allTotal = all.columns.reduce((s, c) => s + c.total, 0)
    const bugsTotal = only.columns.reduce((s, c) => s + c.total, 0)
    assert.ok(bugsTotal < allTotal)
  })

  it('внутри колонки сортирует по голосам', async () => {
    const roadmap = await queries.getRoadmap()
    for (const column of roadmap.columns) {
      const counts = column.items.map((i) => i.count)
      assert.deepEqual(counts, [...counts].sort((a, b) => b - a), column.status.key)
    }
  })

  it('колонка ограничена, но знает свой полный размер', async () => {
    const roadmap = await queries.getRoadmap()
    for (const column of roadmap.columns) {
      assert.ok(
        column.items.length <= column.total,
        'показанное не может превышать общее',
      )
    }
    const limited = roadmap.columns.find((c) => c.total > c.items.length)
    assert.ok(limited, 'нужна хотя бы одна колонка с «показать все»')
  })

  it('карточки ведут на существующие обращения', async () => {
    const roadmap = await queries.getRoadmap()
    for (const column of roadmap.columns) {
      for (const item of column.items) {
        const post = await queries.getPost(item.boardSlug, item.slug)
        assert.ok(post, `битая ссылка: ${item.boardSlug}/${item.slug}`)
      }
    }
  })

  it('не показывает обращения, которых нет в публичной ленте', async () => {
    const roadmap = await queries.getRoadmap()
    for (const column of roadmap.columns) {
      for (const item of column.items) {
        assert.notEqual(item.typeName, 'Вопрос')
      }
    }
  })
})

const emptyQuery = { kinds: [], labels: [] }

describe('changelog', () => {
  it('идёт от свежего к старому', async () => {
    const result = await queries.getChangelog({ ...emptyQuery, limit: 100 })
    const dates = result.items.map((e) => e.publishedAt)
    assert.deepEqual(dates, [...dates].sort().reverse())
  })

  it('дозагружается курсором без дублей', async () => {
    const first = await queries.getChangelog({ ...emptyQuery, limit: 2 })
    assert.ok(first.nextCursor)
    const second = await queries.getChangelog({
      ...emptyQuery,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    })
    const slugs = [...first.items, ...second.items].map((e) => e.slug)
    assert.equal(new Set(slugs).size, slugs.length)
  })

  it('фильтр по типу оставляет только записи с таким изменением', async () => {
    const fixed = await queries.getChangelog({ kinds: ['fixed'], labels: [], limit: 100 })
    assert.ok(fixed.items.length > 0)
    for (const entry of fixed.items) {
      assert.ok(entry.changes.some((c) => c.kind === 'fixed'))
    }

    const all = await queries.getChangelog({ ...emptyQuery, limit: 100 })
    assert.ok(fixed.total < all.total, 'фильтр обязан сужать выборку')
  })

  it('счётчики типов считаются по всем записям, а не по странице', async () => {
    const page = await queries.getChangelog({ ...emptyQuery, limit: 1 })
    const all = await queries.getChangelog({ ...emptyQuery, limit: 100 })
    const sum = page.kindFacets.reduce((s, f) => s + f.count, 0)
    assert.ok(sum >= all.total, 'фасеты не должны зависеть от размера страницы')
  })

  it('типы записи выводятся из её изменений, а не задаются отдельно', async () => {
    const result = await queries.getChangelog({ ...emptyQuery, limit: 100 })
    for (const entry of result.items) {
      assert.deepEqual(
        [...entry.kinds].sort(),
        [...new Set(entry.changes.map((c) => c.kind))].sort(),
      )
    }
  })

  it('запись открывается по своему адресу', async () => {
    const result = await queries.getChangelog({ ...emptyQuery, limit: 1 })
    const slug = result.items[0]!.slug
    const entry = await queries.getChangelogEntry(slug)
    assert.ok(entry)
    assert.equal(entry.slug, slug)
    assert.equal(await queries.getChangelogEntry('нет-такого'), null)
  })

  it('закрытые обращения ведут на реальные и уже закрыты', async () => {
    const result = await queries.getChangelog({ ...emptyQuery, limit: 100 })
    const withPosts = result.items.filter((e) => e.closedPosts.length > 0)
    assert.ok(withPosts.length > 0, 'связь релиза с обращениями — ключевая механика')

    for (const entry of withPosts) {
      for (const post of entry.closedPosts) {
        const target = await queries.getPost(post.boardSlug, post.slug)
        assert.ok(target, `битая ссылка на ${post.slug}`)
        assert.equal(
          post.status.isTerminal,
          true,
          'релиз обязан закрывать обращение, а не оставлять открытым',
        )
      }
    }
  })
})
