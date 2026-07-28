/**
 * Решения триажа и объединение обращений.
 *
 * Отдельного внимания стоит merge: он делается часто и ошибочно тоже часто,
 * а цена ошибки — испорченные счётчики и потерянные комментарии, которые
 * никто не заметит сразу. Проверяется именно то, что обычно ломают:
 * дедупликация голосов, сохранение отписки и пересчёт счётчиков из фактов.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { createPost, toggleVote } from '@/core/domain/post/mutations'
import { applyDecision, mergePosts } from '@/core/domain/triage/decisions'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'decisions-test-'
const madePosts: string[] = []

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тестовый участник' },
  })
}

async function makePost(author: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId: author,
    title,
    details: 'Тело обращения для проверки объединения.',
  })
  madePosts.push(post.id)
  return post
}

suite('решения триажа', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('отказ без причины не принимается', async () => {
    const author = await user('author-1')
    const post = await makePost(author.id, 'Обращение для отказа без причины')

    const result = await applyDecision(post.id, 'wont-fix', author.id, '   ')
    assert.deepEqual(result, { ok: false, reason: 'reason-required' })

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { resolution: true, status: { select: { key: true } } },
    })
    assert.equal(stored.resolution, null, 'обращение закрылось без причины')
    assert.equal(stored.status.key, 'open')
  })

  it('решение меняет статус, пишет историю и сохраняет причину', async () => {
    const author = await user('author-2')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const post = await makePost(author.id, 'Обращение для отказа с причиной')

    const reason = 'Ломает разграничение доступа между филиалами.'
    assert.deepEqual(await applyDecision(post.id, 'wont-fix', team.id, reason), {
      ok: true,
    })

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: {
        resolution: true,
        resolutionReasonPublic: true,
        firstResponseAt: true,
        status: { select: { key: true } },
        statusChanges: { orderBy: { createdAt: 'asc' } },
      },
    })

    assert.equal(stored.status.key, 'wont-fix')
    assert.equal(stored.resolution, 'wont_fix')
    assert.equal(stored.resolutionReasonPublic, reason)
    assert.ok(stored.firstResponseAt, 'решение не засчиталось как первый ответ')
    /* Первая запись — создание, вторая — это решение. */
    assert.equal(stored.statusChanges.length, 2)
    assert.equal(stored.statusChanges[1]?.note, reason)
  })

  it('«нужна информация» отмечает ожидание ответа автора', async () => {
    const author = await user('author-3')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const post = await makePost(author.id, 'Обращение с запросом информации')

    await applyDecision(post.id, 'needs-info', team.id, 'Нужны шаги воспроизведения.')

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { needsInfoSince: true, status: { select: { key: true } } },
    })
    assert.equal(stored.status.key, 'needs-info')
    assert.ok(stored.needsInfoSince, 'не отмечено, с какого момента ждём автора')
  })

  it('merge дедуплицирует голоса, а не складывает их', async () => {
    const author = await user('author-4')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const [both, onlySource, onlyTarget] = await Promise.all([
      user('voter-both'),
      user('voter-source'),
      user('voter-target'),
    ])

    const target = await makePost(author.id, 'Целевое обращение для объединения')
    const source = await makePost(author.id, 'Дубликат для объединения')

    /* Один человек голосует за оба — именно он и ломает наивный merge. */
    await toggleVote(target.id, both.id)
    await toggleVote(source.id, both.id)
    await toggleVote(source.id, onlySource.id)
    await toggleVote(target.id, onlyTarget.id)

    const result = await mergePosts(source.id, target.id, team.id)
    assert.ok(result.ok)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: target.id },
      select: { voteCount: true },
    })
    const rows = await prisma.vote.count({ where: { postId: target.id } })

    /* Автор целевого, автор дубликата и трое голосовавших — но `both`
       считается один раз. Автор обращения голос не получает. */
    assert.equal(rows, 3, 'голоса задвоились при объединении')
    assert.equal(stored.voteCount, rows, 'счётчик разошёлся с числом строк')
  })

  it('merge переносит комментарии и не рвёт тред', async () => {
    const author = await user('author-5')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const target = await makePost(author.id, 'Цель для переноса комментариев')
    const source = await makePost(author.id, 'Источник для переноса комментариев')

    await prisma.comment.create({
      data: { postId: source.id, authorId: author.id, body: 'Комментарий из дубликата.' },
    })

    const result = await mergePosts(source.id, target.id, team.id)
    assert.ok(result.ok)
    assert.equal(result.movedComments, 1)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: target.id },
      select: { commentCount: true, comments: true },
    })
    assert.equal(stored.comments.length, 1)
    assert.equal(stored.commentCount, 1, 'счётчик комментариев не пересчитан')
  })

  it('merge сохраняет отписку: чужое объединение не подписывает заново', async () => {
    const author = await user('author-6')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const quiet = await user('voter-unsubscribed')

    const target = await makePost(author.id, 'Цель для проверки отписки')
    const source = await makePost(author.id, 'Источник для проверки отписки')

    await prisma.subscription.create({
      data: {
        postId: source.id,
        userId: quiet.id,
        source: 'vote',
        unsubscribedAt: new Date(),
      },
    })

    assert.ok((await mergePosts(source.id, target.id, team.id)).ok)

    const moved = await prisma.subscription.findUnique({
      where: { postId_userId: { postId: target.id, userId: quiet.id } },
    })
    assert.ok(moved, 'подписка не перенесена')
    assert.ok(moved.unsubscribedAt, 'отписавшийся снова стал получать письма')
  })

  it('смерженное обращение становится указателем на целевое', async () => {
    const author = await user('author-7')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const target = await makePost(author.id, 'Цель для указателя')
    const source = await makePost(author.id, 'Источник для указателя')

    assert.ok((await mergePosts(source.id, target.id, team.id)).ok)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: source.id },
      select: { mergedIntoId: true, resolution: true },
    })
    assert.equal(stored.mergedIntoId, target.id)
    assert.equal(stored.resolution, 'duplicate')

    const log = await prisma.mergeLog.findFirst({ where: { sourceId: source.id } })
    assert.ok(log, 'журнал слияния не записан — откат станет невозможен')
  })

  it('цепочки указателей не образуются', async () => {
    const author = await user('author-8')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const final = await makePost(author.id, 'Конечная цель цепочки')
    const middle = await makePost(author.id, 'Середина цепочки')
    const first = await makePost(author.id, 'Начало цепочки')

    assert.ok((await mergePosts(middle.id, final.id, team.id)).ok)
    /* Мержим в уже смерженное — должно уехать в конечную цель, а не в него. */
    assert.ok((await mergePosts(first.id, middle.id, team.id)).ok)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: first.id },
      select: { mergedIntoId: true },
    })
    assert.equal(stored.mergedIntoId, final.id, 'образовалась цепочка указателей')
  })

  it('обращение нельзя смержить в само себя', async () => {
    const author = await user('author-9')
    const team = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })
    const post = await makePost(author.id, 'Обращение для проверки самослияния')

    assert.deepEqual(await mergePosts(post.id, post.id, team.id), {
      ok: false,
      reason: 'same-post',
    })
  })
})
