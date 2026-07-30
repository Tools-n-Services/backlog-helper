/**
 * Элементы бэклога и связь с обращениями.
 *
 * Проверяется ровно то, ради чего бэклог отделён от обращений
 * (06-backlog.md, раздел 0): связь идёт в обе стороны как N:M, работа
 * живёт без единого обращения, а её формулировка не привязана к публичной.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import {
  createBacklogItem,
  createFromPost,
  linkPosts,
  searchLinkCandidates,
  unlinkPost,
  updateBacklogItem,
} from '@/core/domain/backlog/mutations'
import { createPost } from '@/core/domain/post/mutations'
import { applyDecision } from '@/core/domain/triage/decisions'
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

const EMAIL_PREFIX = 'backlog-test-'
const TITLE_PREFIX = 'Проверка бэклога'
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
    details: 'Тело обращения для проверки бэклога.',
  })
  madePosts.push(post.id)
  return post
}

async function makeItem(title: string, extra: Record<string, unknown> = {}) {
  const result = await createBacklogItem({ title, ...extra })
  assert.equal(result.ok, true)
  if (result.ok) madeItems.push(result.id)
  return result
}

suite('бэклог', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.backlogItem.deleteMany({ where: { id: { in: madeItems } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('заводит работу без единого обращения', async () => {
    const created = await makeItem(`${TITLE_PREFIX}: техдолг`, { kind: 'tech' })
    assert.equal(created.ok, true)
    if (!created.ok) return

    const item = await queries.getBacklogItem(created.id)
    assert.ok(item)
    assert.equal(item.kind, 'tech')
    /* Ноль обращений — нормальное состояние, а не пустая заготовка:
       техдолг конкурирует за приоритет наравне (FR-605). */
    assert.equal(item.posts.length, 0)
    assert.equal(item.postCount, 0)
    assert.equal(item.voteCount, 0)
  })

  it('связь идёт в обе стороны: два обращения в одной работе и одно в двух', async () => {
    const author = await user('author')
    const first = await makePost(author.id, `${TITLE_PREFIX}: выгрузка в Excel`)
    const second = await makePost(author.id, `${TITLE_PREFIX}: выгрузка отчёта`)

    const exportWork = await makeItem(`${TITLE_PREFIX}: массовая выгрузка`)
    const accessWork = await makeItem(`${TITLE_PREFIX}: права на выгрузку`)
    if (!exportWork.ok || !accessWork.ok) return

    await linkPosts(exportWork.id, [first.id, second.id])
    await linkPosts(accessWork.id, [first.id])

    const exportItem = await queries.getBacklogItem(exportWork.id)
    assert.equal(exportItem?.posts.length, 2)

    /* Обратная сторона связи: обращение попало в две работы сразу,
       и это не ошибка учёта, а обычный случай. */
    const links = await queries.getBacklogLinksForPost(first.id)
    assert.equal(links.length, 2)
    assert.deepEqual(
      links.map((l) => l.title).sort(),
      [`${TITLE_PREFIX}: массовая выгрузка`, `${TITLE_PREFIX}: права на выгрузку`].sort(),
    )
  })

  it('повторная привязка не создаёт дубль, отвязка не трогает обращение', async () => {
    const author = await user('author')
    const post = await makePost(author.id, `${TITLE_PREFIX}: повторная привязка`)
    const work = await makeItem(`${TITLE_PREFIX}: работа с повтором`)
    if (!work.ok) return

    await linkPosts(work.id, [post.id])
    await linkPosts(work.id, [post.id])
    assert.equal((await queries.getBacklogItem(work.id))?.posts.length, 1)

    await unlinkPost(work.id, post.id)
    assert.equal((await queries.getBacklogItem(work.id))?.posts.length, 0)
    /* Отвязка — разрыв связи, а не удаление запроса человека. */
    assert.ok(await prisma.post.findUnique({ where: { id: post.id } }))
  })

  it('работа из обращения копирует текст, а дальше формулировки расходятся', async () => {
    const author = await user('author')
    const title = `${TITLE_PREFIX}: исходный заголовок`
    const post = await makePost(author.id, title)

    const created = await createFromPost(post.id, author.id)
    assert.equal(created.ok, true)
    if (!created.ok) return
    madeItems.push(created.id)

    assert.equal((await queries.getBacklogItem(created.id))?.title, title)

    await updateBacklogItem(created.id, { title: `${TITLE_PREFIX}: внутренняя формулировка` })
    const renamed = await queries.getBacklogItem(created.id)
    assert.equal(renamed?.title, `${TITLE_PREFIX}: внутренняя формулировка`)
    /* Публичный заголовок остался прежним: копия, а не ссылка (FR-603). */
    const kept = await prisma.post.findUnique({
      where: { id: post.id },
      select: { title: true },
    })
    assert.equal(kept?.title, `${TITLE_PREFIX}: исходный заголовок`)
    assert.equal(renamed?.posts.length, 1)
  })

  it('решение «в бэклог» заводит работу и не плодит копии при повторе', async () => {
    const author = await user('author')
    const team = await user('team')
    const post = await makePost(author.id, `${TITLE_PREFIX}: решение триажа`)

    await applyDecision(post.id, 'backlog', team.id, '')
    const afterFirst = await queries.getBacklogLinksForPost(post.id)
    assert.equal(afterFirst.length, 1)
    madeItems.push(afterFirst[0]!.id)

    await applyDecision(post.id, 'backlog', team.id, '')
    assert.equal((await queries.getBacklogLinksForPost(post.id)).length, 1)
  })

  it('кандидаты на привязку исключают уже связанные обращения', async () => {
    const author = await user('author')
    const post = await makePost(author.id, `${TITLE_PREFIX}: кандидат на привязку`)
    const work = await makeItem(`${TITLE_PREFIX}: работа для поиска`)
    if (!work.ok) return

    const before = await searchLinkCandidates(work.id, 'кандидат на привязку')
    assert.ok(before.some((c) => c.id === post.id))

    await linkPosts(work.id, [post.id])
    const after = await searchLinkCandidates(work.id, 'кандидат на привязку')
    assert.ok(!after.some((c) => c.id === post.id))
  })

  it('завершённые работы скрыты из бэклога, пока их не попросят', async () => {
    const done = await makeItem(`${TITLE_PREFIX}: уже выпущено`)
    if (!done.ok) return
    await updateBacklogItem(done.id, { internalStatusKey: 'released' })

    const query = {
      statusKeys: [],
      themeSlugs: [],
      kinds: [],
      search: TITLE_PREFIX,
      sort: 'rank' as const,
    }
    const active = await queries.getBacklog({ ...query, includeDone: false })
    assert.ok(!active.items.some((i) => i.id === done.id))

    const all = await queries.getBacklog({ ...query, includeDone: true })
    assert.ok(all.items.some((i) => i.id === done.id))
  })

  it('фазы крупной работы видны в карточке родителя и берут его тему', async () => {
    const theme = await prisma.theme.findFirst({ select: { id: true, name: true } })
    const parent = await makeItem(`${TITLE_PREFIX}: крупная работа`, {
      themeId: theme?.id ?? null,
    })
    if (!parent.ok) return
    const phase = await makeItem(`${TITLE_PREFIX}: первая фаза`, { parentId: parent.id })
    if (!phase.ok) return

    /* Без наследования темы фаза выпадает из фильтра, по которому
       и смотрят, сколько сил уходит в направление. */
    assert.equal((await queries.getBacklogItem(phase.id))?.themeName, theme?.name ?? null)

    const item = await queries.getBacklogItem(parent.id)
    assert.equal(item?.children.length, 1)
    assert.equal(item?.children[0]?.title, `${TITLE_PREFIX}: первая фаза`)

    const child = await queries.getBacklogItem(phase.id)
    assert.equal(child?.parent?.id, parent.id)
  })
})
