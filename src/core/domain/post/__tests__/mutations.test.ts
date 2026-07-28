/**
 * Мутации на настоящей базе.
 *
 * Главное здесь — проверка на повторный клик Vote. Она обязательна
 * (08-dev-plan.md, итерация B2) и проверяет не код, а схему: гарантию даёт
 * уникальный индекс `(post_id, user_id)`, а не условие в приложении.
 * Условие в приложении эту ошибку не ловит принципиально — два параллельных
 * запроса читают «голоса нет» оба.
 *
 * Каждый тест убирает за собой: база общая с портом разработки, и мусор
 * в ней потом невозможно отличить от данных.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import {
  addComment,
  createPost,
  toggleSubscription,
  toggleVote,
} from '@/core/domain/post/mutations'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const created: { posts: string[]; comments: string[] } = { posts: [], comments: [] }

/**
 * Участники заводятся свои, а не берутся из сида.
 *
 * Взять засеянного — значит сначала снять его существующий голос, чтобы
 * начать с чистого листа, а потом не вернуть: обращение навсегда теряет
 * голос, и проверка паритета с фикстурами перестаёт сходиться. Свои
 * участники удаляются целиком, вместе с голосами и подписками по каскаду.
 */
const TEST_EMAIL_PREFIX = 'mutations-test-'

async function someUser(tag: string) {
  const email = `${TEST_EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тестовый участник' },
  })
}

async function somePost() {
  return prisma.post.findFirstOrThrow({
    where: { board: { slug: 'product' }, mergedIntoId: null },
    orderBy: { voteCount: 'desc' },
  })
}

suite('мутации обращений', () => {
  beforeAll(async () => {
    /* Остатки прошлого прогона: если он упал на середине, чистить нечему,
       но и мешать следующему они не должны. */
    await prisma.appUser.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    })
  })

  afterAll(async () => {
    await prisma.comment.deleteMany({ where: { id: { in: created.comments } } })
    await prisma.post.deleteMany({ where: { id: { in: created.posts } } })
    /* Голоса, подписки и комментарии тестовых участников уходят каскадом. */
    await prisma.appUser.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    })
  })

  it('повторный клик Vote не удваивает счётчик', async () => {
    const post = await somePost()
    const user = await someUser('900')

    const before = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .voteCount

    /* Именно параллельно: последовательные вызовы — это переключатель,
       и они бы прошли даже при проверке в коде. */
    await Promise.all([
      toggleVote(post.id, user.id),
      toggleVote(post.id, user.id),
      toggleVote(post.id, user.id),
    ])

    const after = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .voteCount
    const rows = await prisma.vote.count({
      where: { postId: post.id, userId: user.id },
    })

    assert.equal(rows, 1, 'у одного человека больше одного голоса за обращение')
    assert.equal(after, before + 1, 'счётчик разошёлся с числом строк')

  })

  it('голос снимается и возвращает счётчик к исходному', async () => {
    const post = await somePost()
    const user = await someUser('901')

    const before = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .voteCount

    const on = await toggleVote(post.id, user.id)
    assert.equal(on.voted, true)
    assert.equal(on.count, before + 1)

    const off = await toggleVote(post.id, user.id)
    assert.equal(off.voted, false)
    assert.equal(off.count, before, 'счётчик не вернулся к исходному')
  })

  it('отписка не удаляет строку: иначе следующий голос подпишет заново', async () => {
    const post = await somePost()
    const user = await someUser('902')

    assert.equal(await toggleSubscription(post.id, user.id), true)
    assert.equal(await toggleSubscription(post.id, user.id), false)

    const row = await prisma.subscription.findUnique({
      where: { postId_userId: { postId: post.id, userId: user.id } },
    })
    assert.ok(row, 'строка подписки удалена')
    assert.ok(row.unsubscribedAt, 'отписка не отмечена временем')

  })

  it('комментарий увеличивает счётчик триггером, а не кодом', async () => {
    const post = await somePost()
    const user = await someUser('903')
    const before = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .commentCount

    const comment = await addComment({
      postId: post.id,
      authorId: user.id,
      body: 'Комментарий из теста мутаций.',
    })
    created.comments.push(comment.id)

    const after = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
      .commentCount
    assert.equal(after, before + 1)
  })

  it('ответ команды останавливает таймер SLA', async () => {
    const post = await prisma.post.findFirstOrThrow({
      where: { type: { key: 'bug' }, firstResponseAt: null, mergedIntoId: null },
    })
    const teamMember = await prisma.appUser.findFirstOrThrow({ where: { isTeam: true } })

    const comment = await addComment({
      postId: post.id,
      authorId: teamMember.id,
      body: 'Разбираемся, вернёмся с деталями.',
    })
    created.comments.push(comment.id)

    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    assert.ok(updated.firstResponseAt, 'первый ответ команды не отмечен')

    /* Возвращаем как было: обращение из фикстур ещё нужно другим тестам. */
    await prisma.post.update({
      where: { id: post.id },
      data: { firstResponseAt: null },
    })
  })

  it('созданное обращение получает номер, историю статуса и подписку автора', async () => {
    const user = await someUser('904')
    const post = await createPost({
      boardSlug: 'product',
      typeKey: 'idea',
      authorId: user.id,
      title: 'Обращение из теста мутаций',
      details: 'Первый абзац.\n\nВторой абзац.',
      categorySlug: 'shifts',
    })
    created.posts.push(post.id)

    assert.match(post.ref, /^RTM-\d+$/)
    assert.equal(post.slug, 'obraschenie-iz-testa-mutatsiy')

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: {
        statusChanges: true,
        subscriptions: true,
        status: { select: { key: true } },
        category: { select: { slug: true } },
      },
    })
    assert.equal(stored.status.key, 'open')
    assert.equal(stored.category?.slug, 'shifts')
    assert.equal(stored.statusChanges.length, 1, 'первый статус не записан в историю')
    assert.equal(stored.subscriptions.length, 1, 'автор не подписан на своё обращение')
  })

  it('одинаковые заголовки получают разные адреса', async () => {
    const user = await someUser('905')
    const title = 'Совпадающий заголовок из теста'

    const first = await createPost({
      boardSlug: 'product',
      typeKey: 'idea',
      authorId: user.id,
      title,
      details: 'Первое.',
    })
    const second = await createPost({
      boardSlug: 'product',
      typeKey: 'idea',
      authorId: user.id,
      title,
      details: 'Второе.',
    })
    created.posts.push(first.id, second.id)

    assert.notEqual(first.slug, second.slug, 'два обращения заняли один адрес')
    assert.notEqual(first.ref, second.ref)
  })

  it('баг получает срок первого ответа, идея — нет', async () => {
    const user = await someUser('906')

    const bug = await createPost({
      boardSlug: 'bugs',
      typeKey: 'bug',
      authorId: user.id,
      title: 'Баг из теста мутаций',
      details: 'Что произошло.',
      severity: 'blocker',
    })
    const idea = await createPost({
      boardSlug: 'product',
      typeKey: 'idea',
      authorId: user.id,
      title: 'Идея из теста мутаций',
      details: 'Чего не хватает.',
    })
    created.posts.push(bug.id, idea.id)

    const [storedBug, storedIdea] = await Promise.all([
      prisma.post.findUniqueOrThrow({ where: { id: bug.id } }),
      prisma.post.findUniqueOrThrow({ where: { id: idea.id } }),
    ])

    assert.ok(storedBug.slaDueAt, 'у блокирующего бага нет срока первого ответа')
    /* Обещать ответ на каждую идею за N часов невыполнимо, и очередь,
       где просрочено всё подряд, перестаёт быть инструментом. */
    assert.equal(storedIdea.slaDueAt, null)
  })
})
