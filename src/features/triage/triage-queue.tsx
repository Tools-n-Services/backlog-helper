'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatCount } from '@/core/content'
import type { TriageRowView } from '@/queries/types'

/**
 * Очередь триажа — главный экран продукта.
 *
 * Плотные ряды, а не карточки: сотня обращений в день с мышью не разбирается,
 * поэтому очередь обязана проходиться целиком с клавиатуры
 * (07-ui-brief.md, разделы 1 и 6).
 *
 * Решения в фазе A применяются в памяти: запись в БД и письма с причиной —
 * это фаза C. Но набор решений и их горячие клавиши уже настоящие (FR-532).
 */

interface Decision {
  key: string
  digit: string
  label: string
  /** Требует текста причины, который уйдёт репортеру (FR-535). */
  needsReason: boolean
}

const DECISIONS: Decision[] = [
  { key: 'confirm', digit: '1', label: 'Подтвердить', needsReason: false },
  { key: 'needs-info', digit: '2', label: 'Запросить информацию', needsReason: true },
  { key: 'not-reproducible', digit: '3', label: 'Не воспроизводится', needsReason: true },
  { key: 'by-design', digit: '4', label: 'Так задумано', needsReason: true },
  { key: 'duplicate', digit: '5', label: 'Дубликат', needsReason: false },
  { key: 'wont-fix', digit: '6', label: 'Не будем делать', needsReason: true },
  { key: 'backlog', digit: '7', label: 'В бэклог', needsReason: false },
]

const SLA_LABELS: Record<TriageRowView['sla']['state'], string> = {
  overdue: 'просрочено',
  soon: 'скоро срок',
  ok: 'в норме',
  none: 'без срока',
  answered: 'отвечено',
}

export function TriageQueue({ rows }: { rows: TriageRowView[] }) {
  const router = useRouter()
  const [cursor, setCursor] = useState(0)
  const [decided, setDecided] = useState<Record<string, string>>({})
  const [helpOpen, setHelpOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  const visible = rows.filter((row) => !decided[row.id])
  const current = visible[Math.min(cursor, visible.length - 1)]

  const move = useCallback(
    (delta: number) => {
      setCursor((c) => {
        const next = Math.max(0, Math.min(visible.length - 1, c + delta))
        rowRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    },
    [visible.length],
  )

  const decide = useCallback(
    (rowId: string, decision: Decision) => {
      setDecided((d) => ({ ...d, [rowId]: decision.label }))
    },
    [],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (event.key === 'Escape') {
        searchRef.current?.blur()
        setHelpOpen(false)
        return
      }
      if (typing) return

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault()
          move(1)
          return
        case 'ArrowUp':
        case 'k':
          event.preventDefault()
          move(-1)
          return
        case 'Enter':
          if (current) {
            event.preventDefault()
            router.push(`/${current.boardSlug}/p/${current.slug}`)
          }
          return
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          return
        case '?':
          event.preventDefault()
          setHelpOpen((v) => !v)
          return
      }

      const decision = DECISIONS.find((d) => d.digit === event.key)
      if (decision && current) {
        event.preventDefault()
        decide(current.id, decision)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, decide, move, router])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <label htmlFor="triage-search" className="sr-only">
          Поиск по очереди
        </label>
        <input
          id="triage-search"
          ref={searchRef}
          type="search"
          placeholder="Поиск  /"
          className="h-7 w-56 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
        />
        <span className="tnum text-small text-faint">
          {formatCount(visible.length)} в очереди
        </span>
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          className="ml-auto rounded-field border border-line px-2 py-0.5 text-small text-muted hover:bg-track"
        >
          Горячие клавиши ?
        </button>
      </div>

      {helpOpen && <Shortcuts />}

      {/* Отступ снизу: панель решений липкая и перекрывала бы последнюю строку. */}
      <table className="w-full border-collapse text-small">
        <caption className="sr-only">
          Очередь триажа. Перемещение стрелками, решение — цифрой.
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-faint">
            <Th className="w-20">SLA</Th>
            <Th className="w-16">Важность</Th>
            <Th className="w-10">Пр.</Th>
            <Th>Обращение</Th>
            <Th className="w-20">Канал</Th>
            <Th className="w-16 text-right">Затр.</Th>
            <Th className="w-14 text-right">Возраст</Th>
            <Th className="w-24">Назначен</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <Row
              key={row.id}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              row={row}
              active={i === Math.min(cursor, visible.length - 1)}
              onSelect={() => setCursor(i)}
            />
          ))}
        </tbody>
      </table>

      <div className="h-12" aria-hidden />

      {visible.length === 0 && (
        <p className="px-4 py-12 text-center text-body text-muted">
          Очередь разобрана. Это нормальное состояние, а не ошибка.
        </p>
      )}

      {current && <DecisionBar row={current} onDecide={(d) => decide(current.id, d)} />}

      {Object.keys(decided).length > 0 && (
        <p className="border-t border-line px-4 py-2 text-small text-faint">
          Решений принято: {formatCount(Object.keys(decided).length)}. В прототипе
          они не сохраняются — запись и письма с причиной появятся в фазе C.
        </p>
      )}
    </div>
  )
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`px-2 py-1.5 font-mono text-label font-medium uppercase ${className}`}
    >
      {children}
    </th>
  )
}

function Row({
  row,
  active,
  onSelect,
  ref,
}: {
  row: TriageRowView
  active: boolean
  onSelect: () => void
  ref: React.Ref<HTMLTableRowElement>
}) {
  return (
    <tr
      ref={ref}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={
        'h-7 cursor-default border-b border-line/70 ' +
        (active ? 'bg-tint' : 'hover:bg-track/60')
      }
    >
      <td className="px-2">
        <SlaCell sla={row.sla} />
      </td>
      <td className="px-2">
        {row.severityShort && (
          <span
            className="inline-flex items-center rounded-pill px-1.5 py-0.5 text-[11px] font-semibold"
            style={{
              background: `var(--color-sev-${row.severityKey}-bg)`,
              color: `var(--color-sev-${row.severityKey}-fg)`,
            }}
          >
            {row.severityShort}
          </span>
        )}
      </td>
      <td className="px-2">
        <span className="tnum font-mono text-[11px] font-semibold uppercase text-ink-2">
          {row.priorityKey ?? '—'}
        </span>
      </td>
      <td className="max-w-0 px-2">
        <span className="flex items-center gap-2">
          {row.regression && (
            <span
              className="shrink-0 rounded-pill px-1.5 text-[10px] font-bold uppercase"
              style={{
                background: 'var(--color-sev-blocker-bg)',
                color: 'var(--color-signal-regression)',
              }}
              title="Повтор ранее исправленного бага"
            >
              рег
            </span>
          )}
          <span className="shrink-0 font-mono text-[11px] text-faint">{row.ref}</span>
          <span className="truncate text-ink-2">{row.title}</span>
        </span>
      </td>
      <td className="px-2 text-faint">{row.sourceName}</td>
      <td className="tnum px-2 text-right text-ink-2">
        {formatCount(row.affectedCount)}
      </td>
      <td className="tnum px-2 text-right text-faint">{row.ageLabel}</td>
      <td className="truncate px-2 text-faint">{row.assigneeName ?? '—'}</td>
    </tr>
  )
}

/**
 * Состояние SLA кодируется тремя каналами: форма маркера, подпись и цвет.
 * Очередь читают по диагонали, и одного цвета там не хватает.
 */
function SlaCell({ sla }: { sla: TriageRowView['sla'] }) {
  const color =
    sla.state === 'overdue'
      ? 'var(--color-signal-overdue)'
      : sla.state === 'soon'
        ? 'var(--color-sev-major-fg)'
        : 'var(--color-faint)'

  const mark =
    sla.state === 'overdue'
      ? '▲'
      : sla.state === 'soon'
        ? '◆'
        : sla.state === 'answered'
          ? '✓'
          : sla.state === 'none'
            ? ''
            : '·'

  return (
    <span
      className="tnum inline-flex items-center gap-1 font-semibold"
      style={{ color }}
      title={SLA_LABELS[sla.state]}
    >
      <span aria-hidden>{mark}</span>
      <span>{sla.label}</span>
      <span className="sr-only">{SLA_LABELS[sla.state]}</span>
    </span>
  )
}

/** Решения одним нажатием (FR-532). Причина обязательна у терминальных. */
function DecisionBar({
  row,
  onDecide,
}: {
  row: TriageRowView
  onDecide: (decision: Decision) => void
}) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-1.5 border-t border-line bg-surface px-4 py-2">
      <span className="mr-1 max-w-[24ch] truncate text-small text-faint">
        {row.ref}
      </span>
      {DECISIONS.map((decision) => (
        <button
          key={decision.key}
          type="button"
          onClick={() => onDecide(decision)}
          className="flex items-center gap-1.5 rounded-field border border-line px-2 py-1 text-small text-ink-2 transition-colors hover:bg-track"
        >
          <kbd className="rounded bg-track px-1 font-mono text-[10px] text-muted">
            {decision.digit}
          </kbd>
          {decision.label}
          {decision.needsReason && (
            <span className="text-faint" title="Причина уйдёт репортеру письмом">
              ·
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Shortcuts() {
  const rows: [string, string][] = [
    ['↑ ↓ / j k', 'перемещение по очереди'],
    ['Enter', 'открыть обращение'],
    ['1 … 7', 'решение по обращению'],
    ['/', 'поиск'],
    ['Esc', 'выйти из поиска'],
    ['?', 'эта подсказка'],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-line bg-track/50 px-4 py-3 text-small">
      {rows.map(([keys, what]) => (
        <div key={keys} className="contents">
          <dt className="font-mono text-[11px] text-ink-2">{keys}</dt>
          <dd className="text-muted">{what}</dd>
        </div>
      ))}
    </dl>
  )
}
