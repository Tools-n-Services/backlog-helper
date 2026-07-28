/**
 * Фоновый процесс портала.
 *
 * Отдельный процесс, а не хук в веб-приложении, по причине из модели данных:
 * письма ставятся в очередь сменой статуса и отправляются потом. Если бы
 * отправка жила в том же запросе, недоступность почты откатывала бы саму
 * смену статуса — и обращение оставалось в старом статусе из-за чужого сбоя.
 *
 *   pnpm worker        один проход и выход (для cron)
 *   pnpm worker --loop постоянно, с паузой между проходами
 */

import { prisma } from '@/core/db'
import {
  dispatchNotifications,
  dispatchReplies,
  portalOrigin,
} from '@/core/domain/post/notifications'

/** Пауза между проходами в режиме --loop. */
const INTERVAL_MS = 30_000

async function pass() {
  const started = Date.now()
  const origin = portalOrigin()

  const statuses = await dispatchNotifications(origin)
  const replies = await dispatchReplies(origin)

  const letters = statuses.letters + replies.letters
  const failed = statuses.failed + replies.failed
  const events = statuses.changes + replies.replies
  if (events === 0 && letters === 0 && failed === 0) return

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[${new Date().toISOString()}] переходов: ${statuses.changes}, ` +
      `ответов: ${replies.replies}, писем: ${letters}` +
      (failed > 0 ? `, не доставлено: ${failed} (повторим)` : '') +
      ` — ${seconds} с`,
  )
}

async function main() {
  const loop = process.argv.includes('--loop')

  if (!loop) {
    await pass()
    return
  }

  console.log(`Рассылка запущена, проход каждые ${INTERVAL_MS / 1000} с. Ctrl+C — остановить.`)
  let stopping = false
  process.on('SIGINT', () => {
    stopping = true
    console.log('\nОстанавливаюсь после текущего прохода…')
  })

  while (!stopping) {
    /* Ошибка одного прохода не должна ронять процесс: очередь никуда
       не денется, а перезапуск по каждой сетевой неудаче — лишний шум. */
    await pass().catch((error) => console.error('Проход упал:', error))
    if (stopping) break
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
