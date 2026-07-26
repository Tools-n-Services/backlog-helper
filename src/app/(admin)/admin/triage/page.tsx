import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import { formatCount, plural } from '@/core/content'
import { TriageQueue } from '@/features/triage/triage-queue'
import { queries } from '@/queries'
import type { TriageSort } from '@/queries/types'

export const metadata: Metadata = {
  title: 'Очередь триажа',
  robots: { index: false },
}

const SORTS: { key: TriageSort; label: string }[] = [
  { key: 'auto', label: 'По важности' },
  { key: 'sla', label: 'По сроку' },
  { key: 'new', label: 'Новые' },
]

/**
 * Очередь триажа (FR-531).
 *
 * Это ядро продукта, а не лента и не роадмап: здесь обращение превращается
 * в решение. Метрики очереди показываются рядом с ней, потому что без них
 * процесс деградирует незаметно (05-bug-intake.md, раздел 3.2).
 */
export default async function TriagePage({
  searchParams,
}: PageProps<'/admin/triage'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const sortRaw = read('sort')
  const sort: TriageSort = SORTS.some((s) => s.key === sortRaw)
    ? (sortRaw as TriageSort)
    : 'auto'
  const overdueOnly = read('overdue') === '1'
  const severityKeys = read('severity')?.split(',').filter(Boolean) ?? []

  const queue = await queries.getTriageQueue({
    sort,
    overdueOnly,
    severityKeys,
    typeKeys: [],
    search: '',
  })

  const hrefWith = (patch: Record<string, string | null>): Route => {
    const next = new URLSearchParams()
    if (sort !== 'auto') next.set('sort', sort)
    if (overdueOnly) next.set('overdue', '1')
    if (severityKeys.length) next.set('severity', severityKeys.join(','))
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const qs = next.toString()
    return (qs ? `/admin/triage?${qs}` : '/admin/triage') as Route
  }

  return (
    <div>
      <div className="border-b border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="text-h3 font-bold text-ink">Очередь триажа</h1>
          <Metric
            value={queue.metrics.untriaged}
            label={['без ответа', 'без ответа', 'без ответа']}
          />
          <Metric
            value={queue.metrics.overdue}
            label={['просрочено', 'просрочено', 'просрочено']}
            alarm={queue.metrics.overdue > 0}
          />
          <Metric
            value={queue.metrics.oldestUntriagedDays}
            label={['день самому старому', 'дня самому старому', 'дней самому старому']}
          />
          <Metric
            value={queue.metrics.awaitingReporter}
            label={['ждёт автора', 'ждёт автора', 'ждёт автора']}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <nav aria-label="Сортировка очереди" className="flex items-center gap-1">
          {SORTS.map((option) => (
            <Link
              key={option.key}
              href={hrefWith({ sort: option.key === 'auto' ? null : option.key })}
              aria-current={sort === option.key ? 'true' : undefined}
              className={
                'rounded-field px-2 py-1 text-small font-semibold transition-colors ' +
                (sort === option.key
                  ? 'bg-ink text-surface'
                  : 'text-muted hover:bg-track hover:text-ink')
              }
            >
              {option.label}
            </Link>
          ))}
        </nav>

        <span aria-hidden className="mx-1 h-4 w-px bg-line" />

        <Link
          href={hrefWith({ overdue: overdueOnly ? null : '1' })}
          aria-pressed={overdueOnly}
          className={
            'rounded-field px-2 py-1 text-small font-semibold transition-colors ' +
            (overdueOnly
              ? 'bg-ink text-surface'
              : 'text-muted hover:bg-track hover:text-ink')
          }
        >
          Только просроченные
        </Link>

        {queue.facets.severities.map((facet) => {
          const active = severityKeys.includes(facet.key)
          const next = active
            ? severityKeys.filter((k) => k !== facet.key)
            : [...severityKeys, facet.key]
          return (
            <Link
              key={facet.key}
              href={hrefWith({ severity: next.length ? next.join(',') : null })}
              aria-pressed={active}
              className={
                'rounded-field px-2 py-1 text-small transition-colors ' +
                (active
                  ? 'bg-ink text-surface'
                  : 'text-muted hover:bg-track hover:text-ink')
              }
            >
              {facet.name}{' '}
              <span className="tnum text-[11px] opacity-70">{facet.count}</span>
            </Link>
          )
        })}
      </div>

      <TriageQueue rows={queue.rows} />
    </div>
  )
}

function Metric({
  value,
  label,
  alarm = false,
}: {
  value: number
  label: [string, string, string]
  alarm?: boolean
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className="tnum text-h3 font-bold"
        style={alarm ? { color: 'var(--color-signal-overdue)' } : undefined}
      >
        {formatCount(value)}
      </span>
      <span className="text-small text-faint">{plural(value, label)}</span>
    </p>
  )
}
