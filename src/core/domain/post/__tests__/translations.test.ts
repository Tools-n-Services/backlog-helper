/**
 * Проход перевода.
 *
 * Проверяется не «перевод получился» — за качество отвечает модель, — а то,
 * что очередь ведёт себя как очередь: язык оригинала определяется при приёме,
 * перевод складывается один на язык, отказ провайдера не теряет обращение
 * и не крутится вечно, а внутренние заметки команды наружу не уходят.
 */

import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { addComment, createPost } from '@/core/domain/post/mutations'
import { translatePending } from '@/core/domain/post/translations'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.post.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'translate-test-'
const madePosts: string[] = []

/** Стенд вместо API: отвечает переводом или отказом — по требованию теста. */
let server: Server
let failing = false

async function startStand(): Promise<void> {
  server = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      if (failing) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ type: 'error', error: { message: 'нет связи' } }))
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5',
          content: [{ type: 'text', text: 'TRANSLATED' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  process.env.TRANSLATE_PROVIDER = 'claude'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`
  process.env.ANTHROPIC_MAX_RETRIES = '0'
}

async function user(tag: string) {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: {},
    create: { email, name: `Проверка ${tag}`, role: 'тест' },
  })
}

async function makePost(authorId: string, title: string, details: string) {
  const post = await createPost({
    boardSlug: 'product',
    typeKey: 'idea',
    authorId,
    title,
    details,
  })
  madePosts.push(post.id)
  return post
}

suite('перевод обращений', () => {
  const saved = { ...process.env }

  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
    await startStand()
  })

  afterAll(async () => {
    process.env = saved
    await prisma.post.deleteMany({ where: { id: { in: madePosts } } })
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('язык оригинала определяется при отправке', async () => {
    const author = await user('language')
    const russian = await makePost(author.id, 'Отчёт не выгружается', 'Кнопка молчит.')
    const english = await makePost(author.id, 'Export fails silently', 'Nothing happens.')

    const rows = await prisma.post.findMany({
      where: { id: { in: [russian.id, english.id] } },
      select: { id: true, sourceLocale: true },
    })

    assert.equal(rows.find((r) => r.id === russian.id)?.sourceLocale, 'ru')
    assert.equal(rows.find((r) => r.id === english.id)?.sourceLocale, 'en')
  })

  it('обращение переводится на второй язык и снимается с очереди', async () => {
    failing = false
    const author = await user('happy')
    const post = await makePost(author.id, 'Смены не копируются', 'Копия недели теряет ночные.')

    await translatePending(50)

    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { translatedAt: true, translations: true },
    })

    assert.ok(row.translatedAt, 'переведённое обращение обязано уйти из очереди')
    assert.equal(row.translations.length, 1)
    assert.equal(row.translations[0]!.locale, 'en')
    assert.equal(row.translations[0]!.title, 'TRANSLATED')
    assert.equal(row.translations[0]!.body, 'TRANSLATED')
    /* Провайдер и модель записаны: меняя переводчика, форк должен знать,
       что переводить заново. */
    assert.equal(row.translations[0]!.provider, 'claude')
    assert.equal(row.translations[0]!.model, 'claude-haiku-4-5')
  })

  it('повторный проход не делает второй перевод того же обращения', async () => {
    failing = false
    const author = await user('once')
    const post = await makePost(author.id, 'Права на шаблоны', 'Нужно ограничить редактирование.')

    await translatePending(50)
    await translatePending(50)

    const count = await prisma.translation.count({ where: { postId: post.id } })
    assert.equal(count, 1)
  })

  it('комментарий переводится, внутренняя заметка — нет', async () => {
    failing = false
    const author = await user('comments')
    const post = await makePost(author.id, 'Сводка по часам', 'Не сходится с табелем.')

    const reply = await addComment({
      postId: post.id,
      authorId: author.id,
      body: 'Повторяется каждую неделю в понедельник.',
    })
    const note = await addComment({
      postId: post.id,
      authorId: author.id,
      body: 'Похоже на округление в отчёте — проверить перед релизом.',
      internal: true,
    })

    await translatePending(50)

    assert.equal(await prisma.translation.count({ where: { commentId: reply.id } }), 1)
    assert.equal(await prisma.translation.count({ where: { commentId: note.id } }), 0)
  })

  it('отказ провайдера оставляет обращение в очереди и считает попытки', async () => {
    failing = true
    const author = await user('failure')
    const post = await makePost(author.id, 'Экспорт в 1С', 'Файл обрывается на середине.')

    await translatePending(50)

    let row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { translatedAt: true, translateAttempts: true },
    })
    assert.equal(row.translatedAt, null, 'непереведённое обращение не снимается с очереди')
    assert.equal(row.translateAttempts, 1)

    /* Три попытки — предел: строка, которую провайдер не берёт в принципе,
       иначе возвращалась бы в каждый проход навсегда. */
    await translatePending(50)
    await translatePending(50)
    await translatePending(50)

    row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { translatedAt: true, translateAttempts: true },
    })
    assert.equal(row.translateAttempts, 3)

    /* И после починки провайдера — тоже не берётся: счётчик исчерпан.
       Это осознанный размен, иначе предел не предел. */
    failing = false
    await translatePending(50)
    assert.equal(await prisma.translation.count({ where: { postId: post.id } }), 0)
  })

  it('выключенный перевод не трогает очередь', async () => {
    failing = false
    const author = await user('off')
    const post = await makePost(author.id, 'Уведомления в почте', 'Приходят с задержкой.')

    process.env.TRANSLATE_PROVIDER = 'off'
    const run = await translatePending(50)
    process.env.TRANSLATE_PROVIDER = 'claude'

    assert.equal(run.skipped, true)
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      select: { translateAttempts: true, translatedAt: true },
    })
    assert.equal(row.translateAttempts, 0, 'выключенный перевод не тратит попытки')
    assert.equal(row.translatedAt, null)
  })
})
