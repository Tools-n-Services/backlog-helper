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
import { dispatchNotifications, portalOrigin } from '@/core/domain/post/notifications'

/** Пауза между проходами в режиме --loop. */
const INTERVAL_MS = 30_000

async function pass() {
  const started = Date.now()
  const result = await dispatchNotifications(portalOrigin())

  if (result.changes === 0 && result.letters === 0 && result.failed === 0) return

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[${new Date().toISOString()}] переходов: ${result.changes}, ` +
      `писем: ${result.letters}` +
      (result.failed > 0 ? `, не доставлено: ${result.failed} (повторим)` : '') +
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
