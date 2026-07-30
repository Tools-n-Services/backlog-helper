/**
 * Маппинг внутренних статусов на публичные (FR-632..636).
 *
 * Проверяется одностороннее правило из 02-data-model.md: внутренний этап
 * двигает публичный статус связанных обращений, обратно — никогда. Нарушение
 * даёт петлю, а у петли в этом продукте есть цена: каждый оборот ставит письмо
 * в очередь, и человек получает их пачкой.
 *
 * Проверяется очередь, а не отправка: письма разбирает отдельный проход,
 * и вопрос «уйдёт ли письмо» решается на строке `status_change` (FR-309).
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { createBacklogItem, linkPosts, updateBacklogItem } from '@/core/domain/backlog/mutations'
import { createPost } from '@/core/domain/post/mutations'
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

const EMAIL_PREFIX = 'status-flow-test-'
const TITLE_PREFIX = 'Проверка маппинга'
const madePosts: string[] = []
const madeItems: string[] = []

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тестовый участник' },
  })
}

async function makePost(authorId: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details: 'Тело обращения для проверки маппинга статусов.',
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

/** Публичный статус обращения прямо сейчас. */
async function statusOf(postId: string): Promise<string> {
  const row = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    select: { status: { select: { key: true } } },
  })
  return row.status.key
}

/** Переходы обращения, ждущие рассылки. */
async function queued(postId: string) {
  return prisma.statusChange.findMany({
    where: { postId, notifiedAt: null, fromStatusId: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { note: true, toStatus: { select: { key: true } } },
  })
}

async function internalStageOf(itemId: string): Promise<string | null> {
  const row = await prisma.backlogItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { internalStatus: { select: { key: true } } },
  })
  return row.internalStatus?.key ?? null
}

suite('маппинг статусов', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.backlogItem.deleteMany({ where: { id: { in: madeItems } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('этап с публичным соответствием переводит все связанные обращения', async () => {
    const author = await user('author')
    const team = await user('team')
    const first = await makePost(author.id, `${TITLE_PREFIX}: первое обращение`)
    const second = await makePost(author.id, `${TITLE_PREFIX}: второе обращение`)
    const item = await makeItem(`${TITLE_PREFIX}: работа на два обращения`, [
      first.id,
      second.id,
    ])

    const saved = await updateBacklogItem(item, {
      internalStatusKey: 'ready',
      actorId: team.id,
    })
    assert.equal(saved.ok, true)
    if (!saved.ok) return

    /* Одна работа — оба обращения: ровно то, ради чего элемент бэклога
       отделён от обращения (06-backlog.md, раздел 0). */
    assert.deepEqual(saved.publicEffect, { statusKey: 'planned', posts: 2 })
    assert.equal(await statusOf(first.id), 'planned')
    assert.equal(await statusOf(second.id), 'planned')

    /* Письма ставятся в очередь, а не отправляются из смены статуса. */
    assert.equal((await queued(first.id)).length, 1)
    assert.equal((await queued(second.id)).length, 1)
  })

  it('внутренний этап без публичного соответствия не двигает и не рассылает', async () => {
    const author = await user('author')
    const team = await user('team')
    const post = await makePost(author.id, `${TITLE_PREFIX}: внутренний переход`)
    const item = await makeItem(`${TITLE_PREFIX}: работа в проверке`, [post.id])

    await updateBacklogItem(item, { internalStatusKey: 'in-progress', actorId: team.id })
    assert.equal(await statusOf(post.id), 'building')
    const afterVisible = (await queued(post.id)).length

    /* `review` публичного соответствия не имеет: для пользователя ничего
       не изменилось — релиза не было (FR-634). */
    const saved = await updateBacklogItem(item, {
      internalStatusKey: 'review',
      actorId: team.id,
    })
    assert.equal(saved.ok, true)
    if (!saved.ok) return
    assert.deepEqual(saved.publicEffect, { statusKey: null, posts: 0 })
    assert.equal(await statusOf(post.id), 'building')
    assert.equal((await queued(post.id)).length, afterVisible, 'внутренний этап встал в очередь писем')
  })

  it('повторное сохранение того же этапа не порождает второго письма', async () => {
    const author = await user('author')
    const team = await user('team')
    const post = await makePost(author.id, `${TITLE_PREFIX}: повторное сохранение`)
    const item = await makeItem(`${TITLE_PREFIX}: работа с повторным сохранением`, [post.id])

    await updateBacklogItem(item, { internalStatusKey: 'ready', actorId: team.id })
    assert.equal((await queued(post.id)).length, 1)

    /* Карточку сохраняют много раз, правя соседние поля. Второй перевод
       в тот же статус — это второе письмо об одном событии, то есть спам. */
    await updateBacklogItem(item, {
      internalStatusKey: 'ready',
      estimate: 'M',
      actorId: team.id,
    })
    assert.equal((await queued(post.id)).length, 1)
  })

  it('ручная смена публичного статуса не трогает внутренний этап', async () => {
    const author = await user('author')
    const team = await user('team')
    const post = await makePost(author.id, `${TITLE_PREFIX}: ручное решение`)
    const item = await makeItem(`${TITLE_PREFIX}: работа с ручным решением`, [post.id])

    await updateBacklogItem(item, { internalStatusKey: 'ready', actorId: team.id })
    assert.equal(await internalStageOf(item), 'ready')

    /* Обратной автоматики нет (FR-633): решение по обращению — это решение
       по обращению, а не по работе команды. Иначе получается петля, в которой
       каждый оборот рассылает письма. */
    await applyDecision(post.id, 'wont-fix', team.id, 'Решили не делать в этом виде.')
    assert.equal(await statusOf(post.id), 'wont-fix')
    assert.equal(await internalStageOf(item), 'ready')

    /* И обратно: работа не «возвращает» обращение в свой статус сама. */
    assert.equal(await statusOf(post.id), 'wont-fix')
  })

  it('отказ уносит публичную причину в переход и в итог обращения', async () => {
    const author = await user('author')
    const team = await user('team')
    const post = await makePost(author.id, `${TITLE_PREFIX}: отказ с причиной`)
    const item = await makeItem(`${TITLE_PREFIX}: работа, от которой отказались`, [post.id])

    const reason = 'Решили сосредоточиться на выгрузках — вернёмся к этому в следующем цикле.'
    await updateBacklogItem(item, {
      internalStatusKey: 'dropped',
      decisionReasonPublic: reason,
      actorId: team.id,
    })

    assert.equal(await statusOf(post.id), 'wont-fix')
    const changes = await queued(post.id)
    /* Письмо без причины хуже молчания: человек узнаёт отказ и не узнаёт,
       почему (FR-636). */
    assert.equal(changes.at(-1)?.note, reason)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { resolution: true, resolutionReasonPublic: true, resolvedById: true },
    })
    assert.equal(stored.resolution, 'wont_fix')
    assert.equal(stored.resolutionReasonPublic, reason)
    assert.equal(stored.resolvedById, team.id)
  })

  it('смерженное обращение не переводится и писем не порождает', async () => {
    const author = await user('author')
    const admin = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const target = await makePost(author.id, `${TITLE_PREFIX}: цель объединения`)
    const source = await makePost(author.id, `${TITLE_PREFIX}: дубль для объединения`)

    const merged = await mergePosts(source.id, target.id, admin.id)
    assert.equal(merged.ok, true)

    /* Дубль остаётся привязанным к работе — связь заводили до объединения. */
    const item = await makeItem(`${TITLE_PREFIX}: работа с дублем`, [source.id, target.id])
    const before = (await queued(source.id)).length

    const saved = await updateBacklogItem(item, {
      internalStatusKey: 'ready',
      actorId: admin.id,
    })
    assert.equal(saved.ok, true)
    if (!saved.ok) return

    /* Указатель не переводится: его подписчики переехали на цель, и письмо
       о статусе страницы, которую они больше не видят, — шум. */
    assert.equal(saved.publicEffect?.posts, 1)
    assert.equal(await statusOf(target.id), 'planned')
    assert.equal(await statusOf(source.id), 'duplicate')
    assert.equal((await queued(source.id)).length, before)
  })
})
