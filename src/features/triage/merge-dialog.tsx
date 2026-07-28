'use client'

import { useEffect, useState, useTransition } from 'react'

import { formatCount } from '@/core/content'
import type { TriageRowView } from '@/queries/types'

import { mergeAction, mergeCandidatesAction, type MergeCandidate } from './actions'

/**
 * Объединение обращений (FR-211).
 *
 * Самая опасная операция продукта: она переносит голоса и комментарии,
 * а обратно разбирается только по журналу слияния. Поэтому цель выбирается
 * явно из поиска, а последствия названы до нажатия, а не после.
 *
 * Направление подписано словами, а не стрелкой: перепутанные местами
 * источник и цель — самая частая ошибка при объединении, и стрелка от неё
 * не спасает.
 */
export function MergeDialog({
  row,
  onDone,
  onCancel,
}: {
  row: TriageRowView
  onDone: (movedVotes: number) => void
  onCancel: () => void
}) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<MergeCandidate[]>([])
  const [target, setTarget] = useState<MergeCandidate | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (target) return
    const query = search
    /* Пауза перед запросом: поиск идёт на каждое нажатие, и без неё
       набранное слово стоит семи обращений к базе. */
    const timer = setTimeout(() => {
      startTransition(async () => {
        setCandidates(await mergeCandidatesAction(row.id, query))
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [search, row.id, target])

  const merge = () => {
    if (!target) return
    setFailed(null)
    startTransition(async () => {
      const result = await mergeAction(row.id, target.id)
      if (result.ok) {
        onDone(result.movedVotes)
        return
      }
      setFailed(reasonText(result.reason))
    })
  }

  return (
    <div className="sticky bottom-0 border-t border-line bg-surface px-4 py-3">
      <p className="text-small text-muted">
        Объединить <span className="font-mono text-ink-2">{row.ref}</span>{' '}
        «{row.title}» — куда?
      </p>

      {target ? (
        <div className="mt-2">
          <div className="rounded-field border border-line px-3 py-2">
            <div className="text-body font-semibold text-ink">{target.title}</div>
            <div className="mt-0.5 text-small text-faint">
              <span className="font-mono">{target.ref}</span> · {target.boardName} ·{' '}
              {target.statusName} · {formatCount(target.voteCount)} голосов
            </div>
          </div>

          {/* Последствия названы до нажатия: после объединения разбираться
              придётся по журналу слияния, а это уже работа. */}
          <p className="mt-2 text-small text-muted">
            Голоса и комментарии переедут сюда, повторные голоса одного человека
            схлопнутся. Обращение {row.ref} останется указателем: его ссылка
            продолжит работать и приведёт на целевое.
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={merge}
              disabled={pending}
              className="rounded-field bg-ink px-3 py-1.5 text-small font-semibold text-surface disabled:opacity-40"
            >
              Объединить
            </button>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rounded-field border border-line px-3 py-1.5 text-small text-ink-2 hover:bg-track"
            >
              Выбрать другое
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-field border border-line px-3 py-1.5 text-small text-ink-2 hover:bg-track"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <label htmlFor="merge-search" className="sr-only">
            Поиск целевого обращения
          </label>
          <input
            id="merge-search"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCancel()
            }}
            placeholder="Заголовок или номер обращения"
            className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
          />

          {candidates.length > 0 && (
            <ul className="mt-2 space-y-1">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => setTarget(candidate)}
                    className="w-full rounded-field border border-line px-3 py-1.5 text-left hover:bg-track"
                  >
                    <span className="text-body text-ink">{candidate.title}</span>
                    <span className="ml-2 text-small text-faint">
                      <span className="font-mono">{candidate.ref}</span> ·{' '}
                      {formatCount(candidate.voteCount)} голосов
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {search.trim().length >= 2 && candidates.length === 0 && !pending && (
            <p className="mt-2 text-small text-faint">
              Ничего не нашлось. Уже объединённые обращения в список не попадают.
            </p>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="mt-2 rounded-field border border-line px-3 py-1.5 text-small text-ink-2 hover:bg-track"
          >
            Отмена
          </button>
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-small" style={{ color: 'var(--color-signal-error)' }}>
          {failed}
        </p>
      )}
    </div>
  )
}

function reasonText(reason: string): string {
  switch (reason) {
    case 'same-post':
      return 'Обращение нельзя объединить с самим собой.'
    case 'source-merged':
      return 'Это обращение уже объединено с другим.'
    case 'forbidden':
      return 'Объединение — уровень администратора портала.'
    default:
      return 'Объединить не удалось: обращение не найдено.'
  }
}
