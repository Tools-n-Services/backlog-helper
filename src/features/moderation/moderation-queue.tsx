'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState, useTransition } from 'react'

import { formatCount, plural } from '@/core/content'
import type { ModerationItemView } from '@/queries/types'

import { approveAction, rejectAction } from './actions'

/**
 * Очередь модерации (FR-201).
 *
 * Обращение показывается целиком, а не карточкой со ссылкой: решение
 * принимается по тексту, и если за каждым нужно уходить на отдельную
 * страницу, очередь не разбирают — она копится, а обращения новых людей
 * не доходят до ленты вовсе.
 */
export function ModerationQueue({ items }: { items: ModerationItemView[] }) {
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pending = items.filter((item) => !decided[item.id])

  const approve = (item: ModerationItemView) => {
    setDecided((d) => ({ ...d, [item.id]: 'approved' }))
    setFailed(null)
    startTransition(async () => {
      const result = await approveAction(item.id)
      if (result.ok) return
      setDecided((d) => {
        const rest = { ...d }
        delete rest[item.id]
        return rest
      })
      setFailed(message(item, result.reason))
    })
  }

  const reject = (item: ModerationItemView, reason: string) => {
    setDecided((d) => ({ ...d, [item.id]: 'rejected' }))
    setRejecting(null)
    setFailed(null)
    startTransition(async () => {
      const result = await rejectAction(item.id, reason)
      if (result.ok) return
      setDecided((d) => {
        const rest = { ...d }
        delete rest[item.id]
        return rest
      })
      setFailed(message(item, result.reason))
    })
  }

  if (pending.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-body text-muted">
        Очередь пуста. Обращения проверенных авторов публикуются сразу — сюда
        попадает только первое обращение нового человека.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-[62rem] px-4 py-6">
      {failed && (
        <p
          role="alert"
          className="mb-4 rounded-card border px-4 py-3 text-small"
          style={{ borderColor: 'var(--color-signal-error)', color: 'var(--color-signal-error)' }}
        >
          {failed}
        </p>
      )}

      <p className="mb-4 text-small text-faint">
        {formatCount(pending.length)}{' '}
        {plural(pending.length, ['обращение ждёт', 'обращения ждут', 'обращений ждут'])}{' '}
        проверки
      </p>

      <ul className="space-y-4">
        {pending.map((item) => (
          <li
            key={item.id}
            className="rounded-card border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small text-faint">
              <span className="font-mono">{item.ref}</span>
              <span>{item.boardName}</span>
              <span>{item.typeName}</span>
              <span>{item.createdLabel}</span>
              {/* Первое обращение автора — то, ради чего очередь и существует:
                  именно на нём отсеивается спам. */}
              {item.authorApprovedCount === 0 && (
                <span className="rounded-pill bg-track px-2 py-0.5 font-semibold text-ink-2">
                  первое обращение автора
                </span>
              )}
            </div>

            <h2 className="mt-2 text-h3 font-bold text-ink">{item.title}</h2>

            <div className="mt-2 space-y-2">
              {item.details.map((paragraph, i) => (
                <p key={i} className="text-body text-ink-2">
                  {paragraph}
                </p>
              ))}
            </div>

            <p className="mt-3 text-small text-muted">
              {item.authorName}{' '}
              <span className="text-faint">· {item.authorEmail}</span>
              {item.authorApprovedCount > 0 && (
                <span className="text-faint">
                  {' '}
                  · уже принято {formatCount(item.authorApprovedCount)}
                </span>
              )}
            </p>

            {rejecting === item.id ? (
              <RejectForm
                onCancel={() => setRejecting(null)}
                onSubmit={(reason) => reject(item, reason)}
              />
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => approve(item)}
                  className="rounded-pill bg-ink px-4 py-1.5 text-small font-semibold text-surface hover:bg-ink-hover"
                >
                  Опубликовать
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(item.id)}
                  className="rounded-pill border border-line px-4 py-1.5 text-small font-semibold text-ink-2 hover:bg-track"
                >
                  Отклонить
                </button>
                <Link
                  href={`/${item.boardSlug}/p/${item.slug}` as Route}
                  className="ml-auto text-small text-muted hover:text-ink"
                >
                  Открыть как увидит автор
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Причина отклонения. Обязательна: отклонённое молча обращение автор считает
 * поломкой портала и пишет ещё раз, теперь уже в поддержку (FR-535).
 */
function RejectForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const ready = reason.trim().length >= 3

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onSubmit(reason)
      }}
      className="mt-4 border-t border-line pt-3"
    >
      <label htmlFor="reject-reason" className="text-small text-muted">
        Причина уйдёт автору письмом
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id="reject-reason"
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel()
          }}
          placeholder="Например: обращение дублирует уже опубликованное"
          className="h-8 min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!ready}
          className="rounded-field bg-ink px-3 py-1.5 text-small font-semibold text-surface disabled:opacity-40"
        >
          Отклонить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-field border border-line px-3 py-1.5 text-small text-ink-2 hover:bg-track"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

function message(item: ModerationItemView, reason: string): string {
  if (reason === 'forbidden') return 'Недостаточно прав: модерацией занимается команда.'
  if (reason === 'already-decided') return `${item.ref} уже разобрал кто-то другой.`
  return `${item.ref}: решение не сохранено.`
}
