/**
 * Охват, деньги и приоритет (FR-611..614, 621..624).
 *
 * Проверяется главное свойство расчёта — **дедупликация по человеку**.
 * Один человек, проголосовавший за три связанных обращения и вдобавок
 * процитированный в инсайте, обязан считаться единицей охвата. Без этого
 * приоритизация систематически завышает то, о чём громче всех говорит
 * небольшая группа, — то есть делает ровно противоположное тому,
 * ради чего её заводили.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { segmentWeights } from '@config/scoring'
import { prisma } from '@/core/db'
import { addInsight, removeInsight } from '@/core/domain/backlog/insights'
import { createBacklogItem, linkPosts, updateBacklogItem } from '@/core/domain/backlog/mutations'
import { recalculateBacklogScores } from '@/core/domain/backlog/scoring'
import { createPost, toggleVote } from '@/core/domain/post/mutations'
import { queries } from '@/queries'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'scoring-test-'
const TITLE_PREFIX = 'Проверка приоритета'
const COMPANY = 'Проверка: Крупный клиент'
const madePosts: string[] = []
const madeItems: string[] = []

async function user(tag: string, segment: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: { segments: [segment] },
    create: { email, name: `Проверка ${tag}`, role: 'тест', segments: [segment] },
  })
}

async function makePost(authorId: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details: 'Тело обращения для проверки приоритета.',
  })
  madePosts.push(post.id)
  return post
}

async function makeItem(title: string, postIds: string[] = []) {
  const created = await createBacklogItem({ title })
  assert.equal(created.ok, true)
  if (!created.ok) throw new Error('работа не создалась')
  madeItems.push(created.id)
  if (postIds.length) await linkPosts(created.id, postIds)
  return created.id
}

async function numbers(itemId: string) {
  await recalculateBacklogScores(itemId)
  const item = await queries.getBacklogItem(itemId)
  assert.ok(item)
  return item
}

suite('охват и приоритет', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
    await prisma.company.deleteMany({ where: { name: COMPANY } })
  })

  afterAll(async () => {
    await prisma.backlogItem.deleteMany({ where: { id: { in: madeItems } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
    await prisma.company.deleteMany({ where: { name: COMPANY } })
  })

  it('человек, голосовавший за несколько связанных обращений, считается один раз', async () => {
    const author = await user('author', 'free')
    const voter = await user('voter', 'free')
    const first = await makePost(author.id, `${TITLE_PREFIX}: первое обращение`)
    const second = await makePost(author.id, `${TITLE_PREFIX}: второе обращение`)
    const third = await makePost(author.id, `${TITLE_PREFIX}: третье обращение`)

    for (const post of [first, second, third]) {
      await toggleVote(post.id, voter.id)
    }

    const item = await makeItem(`${TITLE_PREFIX}: одна работа на три обращения`, [
      first.id,
      second.id,
      third.id,
    ])
    const view = await numbers(item)

    /* Три голоса — и один человек. Сумма голосов завышает ровно на этом,
       и именно поэтому она остаётся отдельным числом рядом с охватом. */
    assert.equal(view.voteCount, 3, 'предпосылка теста: по голосу на обращение')
    assert.equal(view.reach, 1, 'охват посчитал одного человека несколько раз')
  })

  it('вес сегмента отличает корпоративного клиента от бесплатного', async () => {
    const enterprise = await user('enterprise', 'enterprise')
    const free = await user('free', 'free')
    const post = await makePost(free.id, `${TITLE_PREFIX}: обращение с двумя сегментами`)
    /* Голосуют оба: в охват человек попадает голосом или цитатой — так же,
       как в affected_count обращения. Автор, который ничего не нажал,
       остаётся автором, а не затронутым. */
    await toggleVote(post.id, enterprise.id)
    await toggleVote(post.id, free.id)

    const item = await makeItem(`${TITLE_PREFIX}: работа с весами`, [post.id])
    const view = await numbers(item)

    /* Один enterprise и один бесплатный: 5 + 1. Без весов было бы 2,
       и сто бесплатных аккаунтов всегда перевешивали бы десять платящих. */
    const expected = (segmentWeights.enterprise ?? 1) + (segmentWeights.free ?? 1)
    assert.equal(view.reach, expected)
  })

  it('цитата от известного человека не удваивает охват, от неизвестного — добавляет', async () => {
    const voter = await user('quoted', 'free')
    const post = await makePost(voter.id, `${TITLE_PREFIX}: обращение с цитатами`)
    await toggleVote(post.id, voter.id)
    const item = await makeItem(`${TITLE_PREFIX}: работа с цитатами`, [post.id])

    const before = (await numbers(item)).reach
    assert.equal(before, 1, 'предпосылка теста: один проголосовавший')

    /* Тот же человек, уже посчитанный голосом: охват не меняется (FR-624). */
    const known = await addInsight({
      backlogItemId: item,
      quote: 'Мы это обсуждали на звонке.',
      authorEmail: `${EMAIL_PREFIX}quoted@example.com`,
    })
    assert.equal(known.ok, true)
    assert.equal((await numbers(item)).reach, before)

    /* Цитата от неизвестного — это всё же ещё один затронутый. */
    const anonymous = await addInsight({
      backlogItemId: item,
      quote: 'Клиент со звонка, аккаунта на портале у него нет.',
    })
    assert.equal(anonymous.ok, true)
    assert.equal((await numbers(item)).reach, before + 1)

    if (anonymous.ok) {
      await removeInsight(anonymous.id)
      assert.equal((await numbers(item)).reach, before, 'удалённая цитата осталась в охвате')
    }
  })

  it('деньги считаются по уникальным компаниям, а не по цитатам', async () => {
    const author = await user('money', 'paid')
    const post = await makePost(author.id, `${TITLE_PREFIX}: обращение про деньги`)
    const item = await makeItem(`${TITLE_PREFIX}: работа про деньги`, [post.id])

    const company = await prisma.company.create({
      data: { name: COMPANY, monthlySpend: 90000 },
    })

    for (const quote of ['Первая цитата клиента.', 'Вторая цитата того же клиента.']) {
      const added = await addInsight({ backlogItemId: item, quote, companyId: company.id })
      assert.equal(added.ok, true)
    }

    /* Две цитаты одного клиента — это по-прежнему один клиент и одна сумма. */
    const view = await numbers(item)
    assert.equal(view.mrrSum, 90000)
    assert.equal(view.insightSummary.quotes, 2)
    assert.equal(view.insightSummary.companies, 1)
    assert.equal(view.insightSummary.mrr, 90000)
  })

  it('цитата от корпоративного клиента поднимает работу в сортировке по приоритету', async () => {
    const paid = await user('rank-a', 'paid')
    const other = await user('rank-b', 'paid')
    const firstPost = await makePost(paid.id, `${TITLE_PREFIX}: спорное обращение А`)
    const secondPost = await makePost(other.id, `${TITLE_PREFIX}: спорное обращение Б`)
    await toggleVote(firstPost.id, paid.id)
    await toggleVote(secondPost.id, other.id)

    const a = await makeItem(`${TITLE_PREFIX}: спорная А`, [firstPost.id])
    const b = await makeItem(`${TITLE_PREFIX}: спорная Б`, [secondPost.id])

    /* Одинаковые оценки и одинаковый охват: порядок между ними определяет
       ровно то, что добавится дальше. */
    for (const id of [a, b]) {
      await updateBacklogItem(id, { impact: 2, confidence: 1, effort: 1 })
    }

    const query = {
      statusKeys: [],
      themeSlugs: [],
      kinds: [],
      search: `${TITLE_PREFIX}: спорная `,
      includeDone: true,
      sort: 'score' as const,
    }
    const before = (await queries.getBacklog(query)).items.map((i) => i.id)
    assert.deepEqual(before.slice(0, 2).sort(), [a, b].sort(), 'обе работы должны быть в выборке')

    const enterprise = await user('rank-enterprise', 'enterprise')
    const added = await addInsight({
      backlogItemId: b,
      quote: 'Без этого мы не сможем продлить контракт на следующий год.',
      authorEmail: `${EMAIL_PREFIX}rank-enterprise@example.com`,
    })
    assert.equal(added.ok, true)
    assert.ok(enterprise)

    const after = await queries.getBacklog(query)
    assert.equal(after.items[0]?.id, b, 'работа с цитатой от enterprise не поднялась')
  })

  it('работа без охвата остаётся без расчётного приоритета, а не с нулём', async () => {
    const item = await makeItem(`${TITLE_PREFIX}: техдолг без обращений`)
    await updateBacklogItem(item, { impact: 1, confidence: 1, effort: 4 })

    const view = await numbers(item)
    assert.equal(view.reach, 0)
    /* Ноль читался бы как «ничего не даст» и задвигал бы техдолг в конец
       любой сортировки. Его место в бэклоге решает человек (FR-615). */
    assert.equal(view.score, null)
  })
})
