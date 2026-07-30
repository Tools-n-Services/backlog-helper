/**
 * Публикация релиза и письма о выпуске (FR-165, FR-166, FR-303).
 *
 * Здесь замыкается цикл: человек проголосовал год назад и получает письмо
 * «то, что вы просили, вышло». Проверяется не «функция вернула ok», а факт
 * появления письма нужного вида в ящике — и то, что второй раз оно не уходит.
 * Отозвать письмо нельзя, поэтому идемпотентность публикации важнее любого
 * другого свойства этого модуля.
 */

import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { MAIL_DIR } from '@/core/mail'
import { publishRelease, publishScheduled } from '@/core/domain/changelog/releases'
import { createPost } from '@/core/domain/post/mutations'
import { dispatchNotifications } from '@/core/domain/post/notifications'
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

const EMAIL_PREFIX = 'release-test-'
const SLUG_PREFIX = 'proverka-reliza-'
const ORIGIN = 'http://localhost:3000'
const madePosts: string[] = []
const madeEntries: string[] = []

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: { notificationPrefs: {} },
    create: { email, name: `Проверка ${tag}`, role: 'тест', notificationPrefs: {} },
  })
}

async function makePost(authorId: string, title: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details: 'Тело обращения для проверки публикации релиза.',
  })
  madePosts.push(post.id)
  return post
}

/**
 * Запись changelog заводится напрямую в базе.
 *
 * Редактора релизов пока нет: запись приходит из сида, импорта или скрипта
 * выкладки, а портал отвечает за публикацию. Тест повторяет ровно этот путь.
 */
async function makeEntry(
  tag: string,
  postIds: string[],
  extra: { scheduledFor?: Date } = {},
) {
  const entry = await prisma.changelogEntry.create({
    data: {
      slug: `${SLUG_PREFIX}${tag}`,
      version: `9.${tag.length}`,
      title: `Проверка релиза: ${tag}`,
      lead: 'Вводка записи для проверки.',
      types: ['fixed'],
      ...(extra.scheduledFor ? { scheduledFor: extra.scheduledFor } : {}),
      changes: {
        create: [
          { kind: 'fixed', title: 'Исправление для проверки', body: 'Тело изменения.', position: 0 },
        ],
      },
      posts: { create: postIds.map((postId) => ({ postId })) },
    },
    select: { id: true, slug: true },
  })
  madeEntries.push(entry.id)
  return entry
}

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

suite('публикация релиза', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
    await prisma.changelogEntry.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } })
  })

  beforeEach(async () => {
    /* Ящик общий на процесс: без чистки предыдущий тест виден следующему. */
    await rm(MAIL_DIR, { recursive: true, force: true })
  })

  afterAll(async () => {
    await prisma.changelogEntry.deleteMany({ where: { id: { in: madeEntries } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('публикация закрывает обращения и присылает письмо о выпуске', async () => {
    const author = await user('vypusk')
    const admin = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение, которое закроет релиз')
    const entry = await makeEntry('vypusk', [post.id])

    const published = await publishRelease(entry.id, admin.id)
    assert.equal(published.ok, true)
    if (!published.ok) return
    assert.equal(published.posts, 1)

    const closed = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { resolution: true, status: { select: { key: true } } },
    })
    assert.equal(closed.status.key, 'completed')
    assert.equal(closed.resolution, 'fixed')

    await dispatchNotifications(ORIGIN)
    const mine = (await inbox()).filter((l) => l.to === author.email)
    assert.equal(mine.length, 1, 'автор не получил письма о выпуске')
    /* Письмо о выпуске, а не «статус изменился»: именно оно возвращает
       человека в продукт (FR-303). */
    assert.match(mine[0]!.subject, /^Вышло: /)
    assert.match(mine[0]!.text, /то, что вы просили, вышло/i)
    assert.match(mine[0]!.text, new RegExp(`/changelog/${entry.slug}`))
    assert.match(mine[0]!.text, /unsubscribe\/confirm\?token=/, 'нет ссылки отписки')
  })

  it('повторная публикация не рассылает второй раз', async () => {
    const author = await user('povtor')
    const admin = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, 'Обращение из релиза, опубликованного дважды')
    const entry = await makeEntry('povtor', [post.id])

    assert.equal((await publishRelease(entry.id, admin.id)).ok, true)
    await dispatchNotifications(ORIGIN)
    assert.equal((await inbox()).filter((l) => l.to === author.email).length, 1)

    const again = await publishRelease(entry.id, admin.id)
    assert.equal(again.ok, false)
    if (!again.ok) assert.equal(again.reason, 'already-published')

    await dispatchNotifications(ORIGIN)
    /* Второе письмо о том же выпуске — это письмо, которое человек считает
       спамом, и отозвать его нельзя. */
    assert.equal((await inbox()).filter((l) => l.to === author.email).length, 1)
  })

  it('черновик не виден на портале, пока не опубликован', async () => {
    const author = await user('chernovik')
    const post = await makePost(author.id, 'Обращение из черновика релиза')
    const entry = await makeEntry('chernovik', [post.id])

    /* Ссылка на запись предсказуема по версии продукта: анонс до срока
       не должен открываться по прямому адресу (FR-166). */
    assert.equal(await queries.getChangelogEntry(entry.slug), null)

    const admin = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    assert.equal((await publishRelease(entry.id, admin.id)).ok, true)
    assert.ok(await queries.getChangelogEntry(entry.slug))
  })

  it('отложенная публикация выходит по сроку, а до срока ждёт', async () => {
    const author = await user('srok')
    const post = await makePost(author.id, 'Обращение из отложенного релиза')
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000)
    const entry = await makeEntry('srok', [post.id], { scheduledFor: inTwoDays })

    const early = await publishScheduled()
    assert.equal(early.published, 0, 'запись вышла раньше названного срока')

    await prisma.changelogEntry.update({
      where: { id: entry.id },
      data: { scheduledFor: new Date(Date.now() - 60_000) },
    })
    const due = await publishScheduled()
    assert.equal(due.published, 1)
    assert.equal(due.posts, 1)

    const closed = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { status: { select: { key: true } }, statusChanges: { select: { changedById: true } } },
    })
    assert.equal(closed.status.key, 'completed')
    /* Публикацию по сроку никто не нажимал — в истории обращения это видно
       по пустому автору перехода, а не по подставленному администратору. */
    assert.equal(closed.statusChanges.at(-1)?.changedById, null)
  })

  it('экран релизов показывает, что закроет публикация', async () => {
    const author = await user('ekran')
    const post = await makePost(author.id, 'Обращение для экрана релизов')
    const entry = await makeEntry('ekran', [post.id])

    const { pending } = await queries.getReleases()
    const mine = pending.find((r) => r.id === entry.id)
    assert.ok(mine, 'черновик не попал в список готовящихся')
    assert.equal(mine.publishedLabel, null)
    assert.deepEqual(
      mine.posts.map((p) => p.title),
      ['Обращение для экрана релизов'],
    )
    /* Автор подписан голосом за своё обращение — значит письмо уйдёт,
       и это число человек видит до нажатия. */
    assert.ok(mine.letters >= 1)
  })
})
