/**
 * Готовый перевод для e2e (FR-181).
 *
 * Настоящий переводчик в прогоне не участвует: сценарий проверяет экран —
 * пометку «переведено», переключение на оригинал и то, что читатель на другом
 * языке видит текст на своём. Ходить за этим в чужой сервис значит поставить
 * прогон в зависимость от чужой доступности и платить за каждый запуск.
 */

import { prisma } from '@/core/db'

import { TRANSLATED } from './translation-fixture'

const SLUG = 'eksport-grafika-v-excel-teryaet-nochnye-smeny'

async function main(): Promise<void> {
  const post = await prisma.post.findFirstOrThrow({
    where: { slug: SLUG },
    select: { id: true, comments: { where: { internal: false }, take: 1, select: { id: true } } },
  })

  await prisma.post.update({
    where: { id: post.id },
    data: { sourceLocale: 'ru', translatedAt: new Date() },
  })
  await prisma.translation.deleteMany({ where: { postId: post.id, locale: 'en' } })
  await prisma.translation.create({
    data: {
      postId: post.id,
      locale: 'en',
      title: TRANSLATED.title,
      body: TRANSLATED.body,
      provider: 'claude',
      model: 'claude-haiku-4-5',
    },
  })

  const comment = post.comments[0]
  if (comment) {
    await prisma.comment.update({
      where: { id: comment.id },
      data: { sourceLocale: 'ru', translatedAt: new Date() },
    })
    await prisma.translation.deleteMany({ where: { commentId: comment.id, locale: 'en' } })
    await prisma.translation.create({
      data: {
        commentId: comment.id,
        locale: 'en',
        body: TRANSLATED.comment,
        provider: 'claude',
        model: 'claude-haiku-4-5',
      },
    })
  }
}

/* Без верхнеуровневого await: скрипт запускается через tsx, который
   собирает файл в CommonJS, а там его нет. */
main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
