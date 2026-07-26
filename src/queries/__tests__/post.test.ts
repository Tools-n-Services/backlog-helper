import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { queries } from '@/queries'
import type { PostDetailView } from '@/queries/types'

const FLAGSHIP = { board: 'bugs', slug: 'eksport-grafika-v-excel-teryaet-nochnye-smeny' }

async function detail(board: string, slug: string): Promise<PostDetailView> {
  const result = await queries.getPost(board, slug)
  assert.ok(result, `обращение ${board}/${slug} не найдено`)
  assert.equal(result.kind, 'post')
  return result as { kind: 'post' } & PostDetailView
}

describe('страница обращения', () => {
  it('отдаёт обращение по адресу из ленты', async () => {
    const feed = await queries.getFeed({
      boardSlug: 'bugs',
      sort: 'new',
      statusKeys: [],
      typeKeys: [],
      categorySlugs: [],
      search: '',
      limit: 100,
    })
    for (const item of feed.items) {
      const result = await queries.getPost(item.boardSlug, item.slug)
      assert.ok(result, `битая ссылка из ленты: ${item.boardSlug}/${item.slug}`)
      assert.equal(result.kind, 'post')
    }
  })

  it('несуществующий адрес даёт null, а не выдуманное обращение', async () => {
    assert.equal(await queries.getPost('bugs', 'takogo-net'), null)
    assert.equal(await queries.getPost('нет-доски', 'нет-обращения'), null)
  })

  it('содержит всё, что нужно странице, без доборов', async () => {
    const post = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.match(post.ref, /^RTM-\d+$/)
    assert.ok(post.details.length >= 1)
    assert.ok(post.author.name && post.author.initials)
    assert.ok(post.statusHistory.length >= 1)
    assert.ok(post.createdLabel)
  })

  it('история статусов идёт от текущего к исходному', async () => {
    const post = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.equal(post.statusHistory[0]?.status.key, post.status.key)
    assert.equal(post.statusHistory.at(-1)?.status.key, 'open')
  })

  it('тред имеет ровно один уровень вложенности', async () => {
    const post = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.ok(post.comments.length > 0)
    for (const comment of post.comments) {
      for (const reply of comment.replies) {
        assert.equal(
          reply.replies.length,
          0,
          'ответ на ответ должен оставаться на том же уровне',
        )
      }
    }
  })

  it('закреплённый ответ команды стоит первым', async () => {
    const post = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.equal(post.comments[0]?.pinned, true)
    assert.equal(post.comments[0]?.author.isTeam, true)
  })

  it('показывает не больше голосовавших, чем всего голосов', async () => {
    const post = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.ok(post.voters.length <= post.votersTotal)
    assert.equal(post.votersTotal, post.count)
  })

  it('смерженный дубликат уводит на целевое обращение, а не в 404', async () => {
    const target = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    assert.ok(target.merged.length > 0, 'нужен хотя бы один смерженный дубликат')

    for (const dupe of target.merged) {
      const result = await queries.getPost(target.boardSlug, dupe.slug)
      assert.ok(result, `дубликат ${dupe.slug} недостижим`)
      assert.equal(result.kind, 'merged')
      if (result.kind === 'merged') {
        assert.equal(result.target.slug, target.slug)
        assert.equal(result.title, dupe.title)
      }
    }
  })

  it('смерженные дубликаты не попадают в ленту', async () => {
    const target = await detail(FLAGSHIP.board, FLAGSHIP.slug)
    const feed = await queries.getFeed({
      boardSlug: target.boardSlug,
      sort: 'new',
      statusKeys: [],
      typeKeys: [],
      categorySlugs: [],
      search: '',
      limit: 1000,
    })
    const slugs = new Set(feed.items.map((i) => i.slug))
    for (const dupe of target.merged) {
      assert.equal(slugs.has(dupe.slug), false, `${dupe.slug} виден в ленте`)
    }
  })
})
