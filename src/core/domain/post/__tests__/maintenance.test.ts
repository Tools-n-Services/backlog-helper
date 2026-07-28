/**
 * Фоновые пересчёты.
 *
 * Особенность этих проходов в том, что без них ничего не ломается на глазах:
 * лента остаётся правдоподобной, счётчики — похожими на настоящие. Поэтому
 * проверяется не «проход отработал», а совпадение с фактами: расхождение
 * подкладывается руками и должно быть найдено.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { product } from '@config/product'
import { prisma } from '@/core/db'
import { createPost, toggleVote } from '@/core/domain/post/mutations'
import {
  recalculateAffected,
  recalculateTrending,
  reconcileCounters,
} from '@/core/domain/post/maintenance'
import { trendScore } from '@/core/domain/shared/trending'
import { mergePosts } from '@/core/domain/triage/decisions'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'maintenance-test-'
const madePosts: string[] = []

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тест' },
  })
}

async function makePost(authorId: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details: 'Тело обращения для проверки пересчётов.',
  })
  madePosts.push(post.id)
  return post
}

suite('фоновые пересчёты', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('trend_score совпадает с формулой по фактическим датам голосов', async () => {
    await recalculateTrending()

    /* Берём обращение с заметным числом голосов: на трёх совпадение
       можно получить случайно. */
    const post = await prisma.post.findFirstOrThrow({
      where: { mergedIntoId: null, voteCount: { gt: 100 } },
      orderBy: { voteCount: 'desc' },
      select: { id: true, trendScore: true },
    })
    const votes = await prisma.vote.findMany({
      where: { postId: post.id },
      select: { createdAt: true },
    })

    const expected = trendScore(
      votes.map((v) => v.createdAt),
      new Date(),
      product.trendingHalfLifeDays,
    )

    /* Допуск: между пересчётом и проверкой проходит время, и знаменатель
       экспоненты чуть меняется. Важно, что это доли процента, а не порядок. */
    const diff = Math.abs(post.trendScore - expected) / expected
    assert.ok(
      diff < 0.001,
      `trend_score разошёлся с формулой: в базе ${post.trendScore}, ожидалось ${expected}`,
    )
  })

  it('снятый голос уменьшает trend_score после пересчёта', async () => {
    const author = await user('trending')
    const voter = await user('trending-voter')
    const post = await makePost(author.id, 'Обращение для пересчёта trending')

    await toggleVote(post.id, voter.id)
    await recalculateTrending()
    const withVote = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { trendScore: true },
    })
    assert.ok(withVote.trendScore > 0, 'свежий голос не дал вклада')

    await toggleVote(post.id, voter.id)
    await recalculateTrending()
    const withoutVote = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { trendScore: true },
    })
    /* Инкремент при голосовании о снятии не знает — именно это и правит
       пересчёт. Без него значение осталось бы прежним. */
    assert.ok(
      withoutVote.trendScore < withVote.trendScore,
      'снятый голос остался в trend_score',
    )
  })

  it('сверка находит и чинит подложенное расхождение счётчика голосов', async () => {
    const author = await user('drift')
    const post = await makePost(author.id, 'Обращение с испорченным счётчиком')
    const actual = (
      await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    ).voteCount

    /* Пишем мимо триггера — ровно так, как это делает импорт или ручная
       правка в базе. */
    await prisma.$executeRawUnsafe(
      `UPDATE "post" SET "vote_count" = $1 WHERE "id" = $2::uuid`,
      actual + 17,
      post.id,
    )

    const { drift, fixed } = await reconcileCounters()
    const mine = drift.find((d) => d.id === post.id && d.column === 'vote_count')

    assert.ok(mine, 'сверка не заметила расхождения')
    assert.equal(mine.stored, actual + 17)
    assert.equal(mine.actual, actual)
    assert.ok(fixed > 0)

    const repaired = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    assert.equal(repaired.voteCount, actual, 'счётчик не восстановлен')
  })

  it('сверка молчит, когда всё сходится', async () => {
    await reconcileCounters()
    const { drift } = await reconcileCounters()
    assert.deepEqual(drift, [], 'повторная сверка нашла расхождения на ровном месте')
  })

  it('охват не задваивает человека, голосовавшего и за дубликат', async () => {
    const author = await user('affected')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const [both, onlyTarget, onlySource] = await Promise.all([
      user('affected-both'),
      user('affected-target'),
      user('affected-source'),
    ])

    const target = await makePost(author.id, 'Целевое обращение для охвата')
    const source = await makePost(author.id, 'Дубликат для охвата')

    await toggleVote(target.id, both.id)
    await toggleVote(target.id, onlyTarget.id)
    await toggleVote(source.id, both.id)
    await toggleVote(source.id, onlySource.id)

    assert.ok((await mergePosts(source.id, target.id, team.id)).ok)
    await recalculateAffected()

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: target.id },
      select: { affectedCount: true, voteCount: true },
    })

    /* Трое разных людей: тот, кто голосовал за оба, считается один раз.
       Иначе охват завышается ровно на то, что merge и был призван схлопнуть. */
    assert.equal(stored.affectedCount, 3, 'охват задвоил голосовавшего за оба')
  })

  it('инсайт добавляет затронутого, даже если автор неизвестен', async () => {
    const author = await user('insight')
    const post = await makePost(author.id, 'Обращение с цитатой из звонка')
    await toggleVote(post.id, (await user('insight-voter')).id)

    await recalculateAffected()
    const before = (
      await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    ).affectedCount

    await prisma.insight.create({
      data: {
        postId: post.id,
        quote: 'Мы теряем на этом по часу в день на каждой точке.',
        source: 'call',
      },
    })
    await recalculateAffected()

    const after = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .affectedCount
    assert.equal(after, before + 1, 'цитата без автора не увеличила охват')
  })
})
