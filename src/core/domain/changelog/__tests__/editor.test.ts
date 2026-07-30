/**
 * Составление записи changelog (FR-161..166).
 *
 * До этого публикация умела закрывать обращения и рассылать письма, а брать
 * саму запись было неоткуда. Проверяется то, что легко сломать незаметно:
 * адрес записи не меняется при переименовании, набор типов не расходится
 * со списком изменений, а вышедшая запись не удаляется.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import {
  addChange,
  createRelease,
  deleteRelease,
  linkReleasePosts,
  removeChange,
  searchReleaseCandidates,
  unlinkReleasePost,
  updateRelease,
} from '@/core/domain/changelog/mutations'
import { publishRelease } from '@/core/domain/changelog/releases'
import { createPost } from '@/core/domain/post/mutations'
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

const EMAIL_PREFIX = 'release-editor-test-'
const TITLE_PREFIX = 'Проверка редактора'
const madePosts: string[] = []
const madeEntries: string[] = []

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
    details: 'Тело обращения для проверки редактора релизов.',
  })
  madePosts.push(post.id)
  return post
}

async function makeRelease(title: string, version?: string) {
  const created = await createRelease({ title: `${TITLE_PREFIX}: ${title}`, version })
  assert.equal(created.ok, true)
  if (!created.ok) throw new Error('запись не создалась')
  madeEntries.push(created.id)
  return created.id
}

suite('редактор релизов', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.changelogEntry.deleteMany({ where: { id: { in: madeEntries } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('запись создаётся черновиком, а не сразу в ленте', async () => {
    const id = await makeRelease('черновик')

    const stored = await prisma.changelogEntry.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true, slug: true },
    })
    /* Между «начал писать» и «люди получили письма» обязан быть отдельный
       осознанный шаг. */
    assert.equal(stored.publishedAt, null)
    assert.equal(await queries.getChangelogEntry(stored.slug), null)
  })

  it('одинаковые версии не сталкиваются адресами', async () => {
    const first = await makeRelease('первая попытка', '9.99')
    const second = await makeRelease('вторая попытка', '9.99')

    const slugs = await prisma.changelogEntry.findMany({
      where: { id: { in: [first, second] } },
      select: { slug: true },
    })
    assert.equal(new Set(slugs.map((s) => s.slug)).size, 2, 'адрес записи повторился')
  })

  it('адрес не меняется при переименовании: на него ведут ссылки из писем', async () => {
    const id = await makeRelease('исходный заголовок')
    const before = await prisma.changelogEntry.findUniqueOrThrow({
      where: { id },
      select: { slug: true },
    })

    await updateRelease(id, { title: `${TITLE_PREFIX}: заголовок переписали целиком` })

    const after = await prisma.changelogEntry.findUniqueOrThrow({
      where: { id },
      select: { slug: true, title: true },
    })
    assert.equal(after.slug, before.slug)
    assert.equal(after.title, `${TITLE_PREFIX}: заголовок переписали целиком`)
  })

  it('набор типов записи следует за списком изменений', async () => {
    const id = await makeRelease('типы изменений')

    await addChange(id, { kind: 'fixed', title: 'Исправление в отчёте' })
    await addChange(id, { kind: 'new', title: 'Новый экран' })

    const withBoth = await prisma.changelogEntry.findUniqueOrThrow({
      where: { id },
      select: { types: true, changes: { select: { id: true, kind: true } } },
    })
    assert.deepEqual([...withBoth.types].sort(), ['fixed', 'new'])

    const fixed = withBoth.changes.find((c) => c.kind === 'fixed')
    assert.ok(fixed)
    await removeChange(fixed.id)

    /* Список типов, живущий отдельной жизнью от изменений, однажды покажет
       в фильтре «исправлено» запись, где исправлений нет (FR-162). */
    const after = await prisma.changelogEntry.findUniqueOrThrow({
      where: { id },
      select: { types: true },
    })
    assert.deepEqual(after.types, ['new'])
  })

  it('обращения привязываются поиском и отвязываются', async () => {
    const author = await user('author')
    const post = await makePost(author.id, `${TITLE_PREFIX}: обращение для релиза`)
    const id = await makeRelease('привязка обращений')

    const found = await searchReleaseCandidates(id, 'обращение для релиза')
    assert.ok(found.some((c) => c.id === post.id))

    await linkReleasePosts(id, [post.id])
    assert.equal((await queries.getRelease(id))?.posts.length, 1)

    /* Уже привязанное из поиска исчезает: иначе его привязывают дважды
       и удивляются, почему счётчик не растёт. */
    const again = await searchReleaseCandidates(id, 'обращение для релиза')
    assert.ok(!again.some((c) => c.id === post.id))

    await unlinkReleasePost(id, post.id)
    assert.equal((await queries.getRelease(id))?.posts.length, 0)
    /* Отвязка — разрыв связи, а не удаление обращения. */
    assert.ok(await prisma.post.findUnique({ where: { id: post.id } }))
  })

  it('вышедшую запись удалить нельзя, черновик — можно', async () => {
    const draft = await makeRelease('черновик на удаление')
    assert.equal((await deleteRelease(draft)).ok, true)
    assert.equal(await prisma.changelogEntry.findUnique({ where: { id: draft } }), null)

    const published = await makeRelease('вышедшая запись')
    const admin = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    assert.equal((await publishRelease(published, admin.id)).ok, true)

    const refused = await deleteRelease(published)
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.equal(refused.reason, 'already-published')
    /* У вышедшей записи есть адрес, по которому ходят из писем о выпуске,
       и переходы в истории обращений, которые на неё ссылаются. */
    assert.ok(await prisma.changelogEntry.findUnique({ where: { id: published } }))
  })
})
