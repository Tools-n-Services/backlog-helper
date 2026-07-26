'use client'

import { useState, useTransition } from 'react'

import { formatCount } from '@/core/content'
import { PostCard } from '@/ui/feed/post-card'
import type { FeedPage, FeedQuery, PostCardView } from '@/queries/types'

import { loadMoreFeed } from './actions'

/**
 * Лента с дозагрузкой. «Показать ещё», а не бесконечный скролл: последний
 * ломает возврат по ссылке и индексацию (07-ui-brief.md, раздел 9).
 */
export function FeedList({
  query,
  initial,
}: {
  query: FeedQuery
  initial: FeedPage
}) {
  const [items, setItems] = useState<PostCardView[]>(initial.items)
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remaining = initial.total - items.length

  const more = () => {
    if (!cursor) return
    setError(null)
    startTransition(async () => {
      try {
        const page = await loadMoreFeed(query, cursor)
        setItems((prev) => [...prev, ...page.items])
        setCursor(page.nextCursor)
      } catch {
        setError('Не удалось загрузить продолжение ленты.')
      }
    })
  }

  return (
    <>
      <ul className="space-y-2.5">
        {items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} />
          </li>
        ))}
      </ul>

      {error && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
          <span className="text-body text-ink-2">{error}</span>
          <button
            type="button"
            onClick={more}
            className="rounded-pill bg-ink px-4 py-1.5 text-small font-semibold text-surface"
          >
            Повторить
          </button>
        </div>
      )}

      {cursor && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={more}
            disabled={pending}
            className="rounded-pill border border-line bg-surface px-5 py-2.5 text-body font-semibold text-ink transition-colors hover:bg-track disabled:opacity-60"
          >
            {pending ? 'Загружаем…' : `Показать ещё ${formatCount(remaining)}`}
          </button>
          <span className="font-mono text-label uppercase text-faint">
            показано {formatCount(items.length)} из {formatCount(initial.total)}
          </span>
        </div>
      )}
    </>
  )
}
