/**
 * Вложения: приём, права и retention (FR-512, FR-561, FR-562).
 *
 * Проверяется то, что стоит дороже всего при ошибке. Белый список — потому
 * что через вложения приходит исполняемое. Права — потому что на скриншоте
 * бага чужие имена и номера заказов, и `team_only` обязан закрываться
 * для постороннего, даже если он знает ссылку. Retention — потому что без
 * него портал молча становится бессрочным хранилищем персональных данных.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import {
  bindAttachments,
  classify,
  decideAccess,
  discardAttachment,
  purgeAttachments,
  uploadAttachment,
} from '@/core/domain/intake/attachments'
import { createPost } from '@/core/domain/post/mutations'
import { applyDecision } from '@/core/domain/triage/decisions'
import { getObject } from '@/core/storage'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'attachment-test-'
const TITLE_PREFIX = 'Проверка вложений'
const madePosts: string[] = []
const madeAttachments: string[] = []

/* Настоящий PNG в восемь байт заголовка: тип файла проверяется по MIME
   и расширению, содержимое хранилищу безразлично. */
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тест' },
  })
}

async function makePost(authorId: string, title: string, typeKey = 'bug') {
  const post = await createPost({
    boardSlug: typeKey === 'bug' ? 'bugs' : 'product',
    typeKey,
    authorId,
    title,
    details: 'Тело обращения для проверки вложений.',
  })
  madePosts.push(post.id)
  return post
}

async function upload(uploaderId: string, name = 'screenshot.png', mime = 'image/png') {
  const result = await uploadAttachment({ name, mime, bytes: PNG }, uploaderId)
  if (result.ok) madeAttachments.push(result.id)
  return result
}

suite('вложения', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { id: { in: madeAttachments } } })
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('тип определяется по MIME, а HAR — по расширению', () => {
    assert.equal(classify('screenshot.png', 'image/png'), 'image')
    assert.equal(classify('console.log', 'text/plain'), 'log')
    /* HAR приходит обычным json: без уточнения по расширению он попал бы
       в «логи» с их лимитом в пять мегабайт. */
    assert.equal(classify('network.har', 'application/json'), 'har')
    assert.equal(classify('data.json', 'application/json'), 'log')
  })

  it('незнакомый тип не принимается вовсе', async () => {
    const author = await user('author')
    const rejected = await upload(author.id, 'setup.exe', 'application/x-msdownload')

    assert.equal(rejected.ok, false)
    /* Белый список: отвергается всё, чего в конфиге нет, включая то,
       о чём мы ещё не слышали. */
    if (!rejected.ok) assert.equal(rejected.reason, 'type')
  })

  it('файл попадает в хранилище и привязывается к обращению команде', async () => {
    const author = await user('author')
    const post = await makePost(author.id, `${TITLE_PREFIX}: со скриншотом`)

    const uploaded = await upload(author.id)
    assert.equal(uploaded.ok, true)
    if (!uploaded.ok) return

    const staged = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.id },
      select: { postId: true, purgeAt: true, storageKey: true, fileName: true },
    })
    /* До отправки формы вложение живёт без обращения и со сроком: брошенный
       черновик не должен оставлять файл навсегда. */
    assert.equal(staged.postId, null)
    assert.ok(staged.purgeAt)
    assert.equal(staged.fileName, 'screenshot.png')
    assert.deepEqual(await getObject(staged.storageKey), PNG)

    assert.equal(await bindAttachments(post.id, [uploaded.id], author.id), 1)

    const bound = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.id },
      select: { postId: true, visibility: true, purgeAt: true },
    })
    assert.equal(bound.postId, post.id)
    /* Вложение бага — team_only: на скриншоте чужие имена и номера заказов
       (FR-561). Решает приватность типа обращения, а не форма. */
    assert.equal(bound.visibility, 'team_only')
    assert.equal(bound.purgeAt, null)
  })

  it('чужую загрузку к своему обращению не привязать', async () => {
    const author = await user('author')
    const stranger = await user('stranger')
    const post = await makePost(stranger.id, `${TITLE_PREFIX}: чужое обращение`)

    const uploaded = await upload(author.id)
    assert.equal(uploaded.ok, true)
    if (!uploaded.ok) return

    /* Идентификатор строки не угадывается, но «не угадывается» — это
       не право доступа. */
    assert.equal(await bindAttachments(post.id, [uploaded.id], stranger.id), 0)
    const untouched = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.id },
      select: { postId: true },
    })
    assert.equal(untouched.postId, null)
  })

  it('team_only открыт команде и автору, закрыт постороннему и гостю', async () => {
    const author = await user('author')
    const stranger = await user('stranger')
    const staff = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await makePost(author.id, `${TITLE_PREFIX}: закрытое вложение`)

    const uploaded = await upload(author.id)
    if (!uploaded.ok) return
    await bindAttachments(post.id, [uploaded.id], author.id)

    const asStaff = await decideAccess(uploaded.id, {
      signedIn: true,
      id: staff.id,
      isStaff: true,
    })
    assert.equal(asStaff.decision, 'allow')

    const asAuthor = await decideAccess(uploaded.id, {
      signedIn: true,
      id: author.id,
      isStaff: false,
    })
    assert.equal(asAuthor.decision, 'allow', 'репортер не видит собственный скриншот')

    /* Знание ссылки правом не является — ради этого отдача и идёт через
       приложение, а не публичным бакетом. */
    const asStranger = await decideAccess(uploaded.id, {
      signedIn: true,
      id: stranger.id,
      isStaff: false,
    })
    assert.equal(asStranger.decision, 'forbid')

    const asGuest = await decideAccess(uploaded.id, {
      signedIn: false,
      id: '',
      isStaff: false,
    })
    assert.equal(asGuest.decision, 'forbid')
  })

  it('передуманное вложение уходит вместе с файлом', async () => {
    const author = await user('author')
    const uploaded = await upload(author.id)
    if (!uploaded.ok) return

    const { storageKey } = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.id },
      select: { storageKey: true },
    })

    await discardAttachment(uploaded.id, author.id)
    assert.equal(await prisma.attachment.findUnique({ where: { id: uploaded.id } }), null)
    assert.equal(await getObject(storageKey), null, 'файл остался в хранилище')
  })

  it('retention убирает брошенную загрузку и назначает срок закрытому обращению', async () => {
    const author = await user('author')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })

    /* 1. Брошенная загрузка: срок вышел. */
    const abandoned = await upload(author.id)
    if (!abandoned.ok) return
    const { storageKey } = await prisma.attachment.findUniqueOrThrow({
      where: { id: abandoned.id },
      select: { storageKey: true },
    })
    await prisma.attachment.update({
      where: { id: abandoned.id },
      data: { purgeAt: new Date(Date.now() - 60_000) },
    })

    /* 2. Вложение живого обращения, которое сейчас закроют. */
    const post = await makePost(author.id, `${TITLE_PREFIX}: закрываемое обращение`)
    const kept = await upload(author.id, 'console.log', 'text/plain')
    if (!kept.ok) return
    await bindAttachments(post.id, [kept.id], author.id)
    await applyDecision(post.id, 'wont-fix', team.id, 'Причина для проверки retention.')

    const result = await purgeAttachments()
    assert.ok(result.purged >= 1)

    /* Брошенное удалено вместе с файлом. */
    assert.equal(await prisma.attachment.findUnique({ where: { id: abandoned.id } }), null)
    assert.equal(await getObject(storageKey), null)

    /* У закрытого обращения вложение осталось, но срок ему уже назначен:
       файл уйдёт через N дней после закрытия, само обращение — нет (FR-562). */
    const scheduled = await prisma.attachment.findUniqueOrThrow({
      where: { id: kept.id },
      select: { purgeAt: true },
    })
    assert.ok(scheduled.purgeAt, 'закрытому обращению не назначен срок хранения')
    assert.ok(scheduled.purgeAt.getTime() > Date.now(), 'срок оказался в прошлом')
  })
})
