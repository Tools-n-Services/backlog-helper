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
import { publishScheduled } from '@/core/domain/changelog/releases'
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
import { processStaleNeedsInfo } from '@/core/domain/triage/needs-info'

type JobName = 'releases' | 'mail' | 'needs-info' | 'trending' | 'affected' | 'reconcile'

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
    name: 'releases',
    what: 'публикация релизов',
    /* Минута: релиз объявляют одновременно в нескольких местах, и запись,
       вышедшая на портале на полчаса позже рассылки, ломает согласованную
       дату так же, как вышедшая раньше. Запрос дешёвый — черновиков со
       сроком единицы. */
    everyMs: MINUTE,
    /* Стоит перед рассылкой намеренно: тогда письма о выпуске уходят тем же
       проходом, а не ждут следующего. */
    run: async () => {
      const r = await publishScheduled()
      if (r.published === 0) return null
      return `опубликовано записей: ${r.published}, закрыто обращений: ${r.posts}`
    },
  },
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
    name: 'needs-info',
    what: 'ожидание ответа автора',
    /* Раз в час достаточно: сроки здесь в днях, и точность до часа
       никому не важна. */
    everyMs: HOUR,
    run: async () => {
      const r = await processStaleNeedsInfo(portalOrigin())
      if (r.reminded + r.closed + r.failed === 0) return null
      return (
        `напоминаний: ${r.reminded}, закрыто: ${r.closed}` +
        (r.failed > 0 ? `, не доставлено: ${r.failed} (повторим)` : '')
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
