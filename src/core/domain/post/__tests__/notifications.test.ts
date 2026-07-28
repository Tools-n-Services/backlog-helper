/**
 * Рассылка и настройки писем (FR-301, FR-302, FR-307, FR-309).
 *
 * Проверяется очередь, а не интерфейс: галочка в профиле — это отображение
 * значения, а вопрос «перестанут ли приходить письма» решается на стороне
 * рассылки. Тест, кликающий по галочке, на этот вопрос не отвечает.
 *
 * Письма уходят в файловый ящик (`MAIL_PROVIDER=file`), поэтому проверяется
 * не «функция вернула ok», а факт появления письма нужному адресату.
 */

import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { MAIL_DIR } from '@/core/mail'
import { addComment, createPost } from '@/core/domain/post/mutations'
import {
  dispatchNotifications,
  dispatchReplies,
} from '@/core/domain/post/notifications'
import { DEFAULT_PREFS, readPrefs } from '@/core/domain/post/notification-prefs'
import { applyDecision } from '@/core/domain/triage/decisions'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'letters-test-'
const ORIGIN = 'http://localhost:3000'
const madePosts: string[] = []

async function user(tag: string, prefs?: Record<string, boolean>) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: { notificationPrefs: prefs ?? {} },
    create: {
      email,
      name: `Проверка ${tag}`,
      role: 'тест',
      notificationPrefs: prefs ?? {},
    },
  })
}

/** Кому ушли письма после прохода рассылки. */
async function inbox(): Promise<{ to: string; subject: string; text: string }[]> {
  let files: string[]
  try {
    files = await readdir(MAIL_DIR)
  } catch {
    return []
  }
  const letters = []
  for (const name of files.filter((f) => f.endsWith('.json'))) {
    letters.push(JSON.parse(await readFile(path.join(MAIL_DIR, name), 'utf8')))
  }
  return letters
}

async function makePost(authorId: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details: 'Тело обращения для проверки писем.',
  })
  madePosts.push(post.id)
  return post
}

suite('письма и настройки', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  beforeEach(async () => {
    /* Ящик общий на процесс: без чистки предыдущий тест виден следующему. */
    await rm(MAIL_DIR, { recursive: true, force: true })
  })

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('незаполненные настройки означают согласие на всё', () => {
    assert.deepEqual(readPrefs({}), DEFAULT_PREFS)
    assert.deepEqual(readPrefs(null), DEFAULT_PREFS)
    /* Вид письма, которого не было в момент сохранения, не должен оказаться
       выключённым только потому, что о нём тогда не знали. */
    assert.equal(readPrefs({ status: false }).replies, true)
  })

  it('смена статуса доходит до подписчика', async () => {
    const author = await user('status-on')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение с включёнными письмами')

    await applyDecision(post.id, 'wont-fix', team.id, 'Причина для письма.')
    const result = await dispatchNotifications(ORIGIN)

    assert.equal(result.changes, 1)
    const letters = await inbox()
    const mine = letters.filter((l) => l.to === author.email)
    assert.equal(mine.length, 1, 'автор не получил письма о статусе')
    assert.match(mine[0]!.text, /Причина для письма/, 'в письме нет текста решения')
    assert.match(mine[0]!.text, /unsubscribe\/confirm\?token=/, 'нет ссылки отписки')
  })

  it('снятая галочка «смена статуса» прекращает эти письма', async () => {
    const author = await user('status-off', { status: false })
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение с выключёнными письмами')

    await applyDecision(post.id, 'wont-fix', team.id, 'Причина для письма.')
    const result = await dispatchNotifications(ORIGIN)

    /* Переход разобран — иначе он вернётся в очередь и будет ждать вечно. */
    assert.equal(result.changes, 1)
    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 0, 'письмо ушло вопреки настройке')
  })

  it('выключенный статус не трогает письма об ответах', async () => {
    const author = await user('mixed', { status: false, replies: true })
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение со смешанными настройками')

    await applyDecision(post.id, 'confirm', team.id, '')
    await addComment({ postId: post.id, authorId: team.id, body: 'Разбираемся, ответим.' })

    await dispatchNotifications(ORIGIN)
    await dispatchReplies(ORIGIN)

    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 1, 'должно прийти ровно письмо об ответе')
    assert.match(mine[0]!.subject, /новый ответ/)
  })

  it('ответ в обсуждении доходит до автора обращения', async () => {
    const author = await user('reply-target')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение, на которое ответят')

    await addComment({
      postId: post.id,
      authorId: team.id,
      body: 'Нужны шаги воспроизведения.',
    })
    const result = await dispatchReplies(ORIGIN)

    assert.equal(result.letters, 1)
    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 1)
    /* Текст ответа в письме целиком: за двумя строками не должно быть
       нужды открывать портал. */
    assert.match(mine[0]!.text, /Нужны шаги воспроизведения/)
  })

  it('свой собственный комментарий письма не порождает', async () => {
    const author = await user('self-reply')
    const post = await makePost(author.id, 'Обращение с собственным комментарием')

    await addComment({ postId: post.id, authorId: author.id, body: 'Добавлю деталей.' })
    const result = await dispatchReplies(ORIGIN)

    assert.equal(result.letters, 0, 'человеку написали о его же комментарии')
    assert.equal(result.replies, 1, 'комментарий должен уйти из очереди')
  })

  it('внутренняя заметка команды не рассылается', async () => {
    const author = await user('internal-note')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение с внутренней заметкой')

    await addComment({
      postId: post.id,
      authorId: team.id,
      body: 'Похоже на дубль, проверить перед ответом.',
      internal: true,
    })
    await dispatchReplies(ORIGIN)

    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 0, 'внутренняя заметка ушла наружу')
  })

  it('повторный проход не рассылает то же самое дважды', async () => {
    const author = await user('once-only')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение для проверки повтора')

    await addComment({ postId: post.id, authorId: team.id, body: 'Первый ответ.' })
    assert.equal((await dispatchReplies(ORIGIN)).letters, 1)
    assert.equal((await dispatchReplies(ORIGIN)).letters, 0)

    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 1)
  })

  it('отписавшийся не получает писем, даже если настройка включена', async () => {
    const author = await user('unsubscribed')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение, от которого отписались')

    await prisma.subscription.updateMany({
      where: { postId: post.id, userId: author.id },
      data: { unsubscribedAt: new Date() },
    })

    await addComment({ postId: post.id, authorId: team.id, body: 'Ответ после отписки.' })
    await dispatchReplies(ORIGIN)

    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 0)
  })
})
