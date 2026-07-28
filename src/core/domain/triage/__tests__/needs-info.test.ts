/**
 * Ожидание ответа автора (FR-533).
 *
 * До этого прохода колонка `needs_info_since` заполнялась и не читалась:
 * обращение висело вечно, а метрика «ждёт автора» только росла. Проверяется
 * весь цикл — запрос информации, напоминание, закрытие, возврат в работу, —
 * потому что ценность именно в замкнутости: каждый шаг по отдельности
 * оставляет обращение в подвешенном состоянии.
 */

import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { product } from '@config/product'
import { prisma } from '@/core/db'
import { MAIL_DIR } from '@/core/mail'
import { addComment, createPost } from '@/core/domain/post/mutations'
import { applyDecision } from '@/core/domain/triage/decisions'
import { processStaleNeedsInfo } from '@/core/domain/triage/needs-info'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'needsinfo-test-'
const ORIGIN = 'http://localhost:3000'
const MS_PER_DAY = 86_400_000
const madePosts: string[] = []

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тест' },
  })
}

async function inbox(to: string) {
  let files: string[]
  try {
    files = await readdir(MAIL_DIR)
  } catch {
    return []
  }
  const letters = []
  for (const name of files.filter((f) => f.endsWith('.json'))) {
    const letter = JSON.parse(await readFile(path.join(MAIL_DIR, name), 'utf8'))
    if (letter.to === to) letters.push(letter)
  }
  return letters as { subject: string; text: string }[]
}

/**
 * Обращение, у которого запросили информацию столько-то дней назад.
 *
 * Дата сдвигается назад руками: ждать пять суток в тесте невозможно,
 * а подменять часы процесса — значит проверять не тот код, который поедет.
 */
async function awaitingSince(tag: string, daysAgo: number) {
  const author = await user(tag)
  const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })

  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId: author.id,
    title: `Обращение в ожидании ответа ${tag}`,
    details: 'Тело обращения.',
  })
  madePosts.push(post.id)

  await addComment({
    postId: post.id,
    authorId: team.id,
    body: 'Уточните, пожалуйста, версию приложения и филиал.',
  })
  await applyDecision(post.id, 'needs-info', team.id, 'Нужны детали.')

  const since = new Date(Date.now() - daysAgo * MS_PER_DAY)
  await prisma.post.update({
    where: { id: post.id },
    data: { needsInfoSince: since },
  })

  return { post, author, team }
}

suite('ожидание ответа автора', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true })
  })

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('свежее ожидание не трогают', async () => {
    const { post, author } = await awaitingSince('fresh', 1)

    const result = await processStaleNeedsInfo(ORIGIN)
    assert.equal(result.closed, 0)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { needsInfoRemindedAt: true, status: { select: { key: true } } },
    })
    assert.equal(stored.status.key, 'needs-info')
    assert.equal(stored.needsInfoRemindedAt, null)
    assert.deepEqual(await inbox(author.email), [])
  })

  it('после срока приходит напоминание с самим вопросом', async () => {
    const { post, author } = await awaitingSince(
      'remind',
      product.needsInfo.remindAfterDays + 1,
    )

    const result = await processStaleNeedsInfo(ORIGIN)
    assert.ok(result.reminded >= 1)

    const letters = await inbox(author.email)
    assert.equal(letters.length, 1)
    assert.match(letters[0]!.subject, /ждём вашего ответа/)
    /* Вопрос целиком: через неделю человек не помнит, о чём спрашивали. */
    assert.match(letters[0]!.text, /версию приложения и филиал/)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { needsInfoRemindedAt: true, status: { select: { key: true } } },
    })
    assert.ok(stored.needsInfoRemindedAt, 'напоминание не отмечено')
    assert.equal(stored.status.key, 'needs-info', 'напоминание не должно закрывать')
  })

  it('напоминание уходит один раз, а не каждым проходом', async () => {
    const { author } = await awaitingSince('once', product.needsInfo.remindAfterDays + 1)

    await processStaleNeedsInfo(ORIGIN)
    await processStaleNeedsInfo(ORIGIN)
    await processStaleNeedsInfo(ORIGIN)

    assert.equal(
      (await inbox(author.email)).length,
      1,
      'человек получил напоминание несколько раз — это путь к отписке',
    )
  })

  it('после второго срока обращение закрывается с резолюцией auto_closed', async () => {
    const { post } = await awaitingSince('close', product.needsInfo.closeAfterDays + 1)

    const result = await processStaleNeedsInfo(ORIGIN)
    assert.ok(result.closed >= 1)

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: {
        resolution: true,
        needsInfoSince: true,
        resolutionReasonPublic: true,
        status: { select: { key: true, isTerminal: true } },
        statusChanges: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    assert.equal(stored.status.key, 'no-response')
    assert.ok(stored.status.isTerminal)
    assert.equal(stored.resolution, 'auto_closed')
    assert.equal(stored.needsInfoSince, null, 'счётчик ожидания не сброшен')
    /* Причина обязана быть: закрытие без объяснения читается как «отмахнулись». */
    assert.match(stored.resolutionReasonPublic ?? '', /ответа не было/)
    /* Закрыло правило, а не человек — приписывать это модератору значит
       соврать в истории обращения. */
    assert.equal(stored.statusChanges[0]?.changedById, null)
  })

  it('закрытое по молчанию возвращается в работу ответом автора', async () => {
    const { post, author } = await awaitingSince(
      'reopen',
      product.needsInfo.closeAfterDays + 1,
    )
    await processStaleNeedsInfo(ORIGIN)

    await addComment({
      postId: post.id,
      authorId: author.id,
      body: 'Версия 2.31, филиал на Ленина.',
    })

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: {
        resolution: true,
        firstResponseAt: true,
        status: { select: { key: true } },
      },
    })

    assert.equal(stored.status.key, 'open', 'обращение не вернулось в работу')
    assert.equal(stored.resolution, null)
    /* Ход снова у команды: таймер первого ответа начинается заново. */
    assert.equal(stored.firstResponseAt, null)
  })

  it('чужой комментарий закрытое обращение не открывает', async () => {
    const { post } = await awaitingSince('stranger', product.needsInfo.closeAfterDays + 1)
    await processStaleNeedsInfo(ORIGIN)

    const stranger = await user('stranger-other')
    await addComment({ postId: post.id, authorId: stranger.id, body: 'И у меня так же.' })

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { resolution: true, status: { select: { key: true } } },
    })
    assert.equal(stored.status.key, 'no-response')
    assert.equal(stored.resolution, 'auto_closed')
  })

  it('решение, принятое человеком, комментарием не отменяется', async () => {
    const author = await user('manual')
    const team = await prisma.appUser.findFirstOrThrow({ where: { accessRole: 'admin' } })
    const post = await createPost({
      boardSlug: 'product',
      typeKey: 'idea',
      authorId: author.id,
      title: 'Обращение, закрытое решением команды',
      details: 'Тело обращения.',
    })
    madePosts.push(post.id)

    await applyDecision(post.id, 'wont-fix', team.id, 'Ломает разграничение доступа.')
    await addComment({ postId: post.id, authorId: author.id, body: 'А если иначе?' })

    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { resolution: true, status: { select: { key: true } } },
    })
    assert.equal(stored.status.key, 'wont-fix', 'комментарий отменил решение команды')
    assert.equal(stored.resolution, 'wont_fix')
  })
})
