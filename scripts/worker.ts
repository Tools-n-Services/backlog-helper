/**
 * Фоновый процесс портала.
 *
 * Отдельный процесс, а не хук в веб-приложении, по причине из модели данных:
 * письма ставятся в очередь сменой статуса и отправляются потом. Если бы
 * отправка жила в том же запросе, недоступность почты откатывала бы саму
 * смену статуса — и обращение оставалось в старом статусе из-за чужого сбоя.
 *
 * Проходы идут с разной частотой. Рассылка — часто: письмо через час после
 * ответа команды уже почти бесполезно. Пересчёты — редко: они дороги
 * и меняют числа, на которые никто не смотрит поминутно.
 *
 *   pnpm worker              один проход всего и выход (для cron)
 *   pnpm worker --loop       постоянно, по расписанию
 *   pnpm worker --only=mail  только один проход по имени
 */

import { prisma } from '@/core/db'
import {
  recalculateAffected,
  recalculateTrending,
  reconcileCounters,
} from '@/core/domain/post/maintenance'
import {
  dispatchNotifications,
  dispatchReplies,
  portalOrigin,
} from '@/core/domain/post/notifications'

type JobName = 'mail' | 'trending' | 'affected' | 'reconcile'

interface Job {
  name: JobName
  what: string
  /** Как часто запускать в режиме --loop. */
  everyMs: number
  /** null — делать было нечего, в журнал не пишем. */
  run: () => Promise<string | null>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const JOBS: Job[] = [
  {
    name: 'mail',
    what: 'рассылка',
    everyMs: MINUTE / 2,
    run: async () => {
      const origin = portalOrigin()
      const statuses = await dispatchNotifications(origin)
      const replies = await dispatchReplies(origin)

      const letters = statuses.letters + replies.letters
      const failed = statuses.failed + replies.failed
      if (statuses.changes + replies.replies + letters + failed === 0) return null

      return (
        `переходов: ${statuses.changes}, ответов: ${replies.replies}, писем: ${letters}` +
        (failed > 0 ? `, не доставлено: ${failed} (повторим)` : '')
      )
    },
  },
  {
    name: 'trending',
    what: 'пересчёт trending',
    everyMs: HOUR,
    run: async () => {
      const { updated } = await recalculateTrending()
      return updated === 0 ? null : `обновлено обращений: ${updated}`
    },
  },
  {
    name: 'affected',
    what: 'пересчёт охвата',
    everyMs: 6 * HOUR,
    run: async () => {
      const { updated } = await recalculateAffected()
      return updated === 0 ? null : `обновлено обращений: ${updated}`
    },
  },
  {
    name: 'reconcile',
    what: 'сверка счётчиков',
    everyMs: 24 * HOUR,
    run: async () => {
      const { drift, fixed } = await reconcileCounters()
      if (drift.length === 0) return null

      /* Расхождения печатаются поимённо, а не числом: важно не «их семь»,
         а где именно пишут мимо триггеров. */
      for (const item of drift) {
        console.warn(
          `  расхождение ${item.table}.${item.column} у ${item.ref ?? item.id}: ` +
            `хранилось ${item.stored}, на самом деле ${item.actual}`,
        )
      }
      return `расхождений: ${drift.length}, исправлено: ${fixed}`
    },
  },
]

async function runJob(job: Job) {
  const started = Date.now()
  try {
    const summary = await job.run()
    if (!summary) return
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`[${new Date().toISOString()}] ${job.what}: ${summary} — ${seconds} с`)
  } catch (error) {
    /* Упавший проход не роняет процесс и не мешает остальным: очередь никуда
       не денется, а перезапуск по каждой сетевой неудаче — лишний шум. */
    console.error(`[${new Date().toISOString()}] ${job.what} упал:`, error)
  }
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  const jobs = only ? JOBS.filter((j) => j.name === only) : JOBS

  if (jobs.length === 0) {
    console.error(
      `Неизвестный проход: ${only}. Доступны: ${JOBS.map((j) => j.name).join(', ')}`,
    )
    process.exitCode = 1
    return
  }

  if (!process.argv.includes('--loop')) {
    for (const job of jobs) await runJob(job)
    return
  }

  console.log(
    'Фоновые проходы запущены:\n' +
      jobs.map((j) => `  ${j.what} — раз в ${humanInterval(j.everyMs)}`).join('\n') +
      '\nCtrl+C — остановить.',
  )

  let stopping = false
  process.on('SIGINT', () => {
    stopping = true
    console.log('\nОстанавливаюсь после текущего прохода…')
  })

  /* Первый запуск каждого прохода — сразу, дальше по расписанию: иначе
     после перезапуска процесса рассылка молчит полминуты, а сверка — сутки. */
  const nextRun = new Map<JobName, number>(jobs.map((j) => [j.name, 0]))

  while (!stopping) {
    for (const job of jobs) {
      if (stopping) break
      if (Date.now() < (nextRun.get(job.name) ?? 0)) continue
      await runJob(job)
      nextRun.set(job.name, Date.now() + job.everyMs)
    }
    if (stopping) break
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}

function humanInterval(ms: number): string {
  if (ms >= HOUR) {
    const hours = Math.round(ms / HOUR)
    return hours === 1 ? 'час' : `${hours} ч`
  }
  const minutes = ms / MINUTE
  return minutes < 1 ? `${Math.round(ms / 1000)} с` : `${minutes} мин`
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
