'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { formatCount, plural } from '@/core/content'
import type { BacklogPostLink } from '@/queries/types'
import { StatusBadge } from '@/ui/primitives/status-badge'
import { linkPostAction, searchCandidatesAction, unlinkPostAction } from './actions'

interface Candidate {
  id: string
  title: string
  boardName: string
  voteCount: number
}

/**
 * Обращения, которые закрывает работа (FR-602).
 *
 * Связь N:M в обе стороны: одну работу питают несколько обращений, и одно
 * обращение может попасть в две работы — «выгрузка в Excel» это и экспорт,
 * и права доступа. Поэтому привязка не «перенос», а именно связь: обращение
 * остаётся на своём месте и продолжает жить своей жизнью.
 *
 * Пустой список — не ошибка: техдолг заводится вообще без обращений.
 */
export function LinkedPosts({
  itemId,
  posts,
}: {
  itemId: string
  posts: BacklogPostLink[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2.5 text-body font-bold text-ink">
        Обращения
        <span className="tnum text-small font-normal text-faint">
          {formatCount(posts.length)}
        </span>
      </h2>

      {posts.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-3 text-small text-muted">
          Ни одного обращения. Так и должно быть у техдолга и требований —
          они конкурируют за приоритет наравне, не имея запроса от людей.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-3 px-3 py-2">
              <Link
                href={`/${post.boardSlug}/p/${post.slug}`}
                className="min-w-0 flex-1 text-small font-semibold text-ink hover:underline"
              >
                {post.title}
              </Link>
              <StatusBadge status={post.status} />
              <span className="tnum shrink-0 text-small text-muted">
                {formatCount(post.count)} {plural(post.count, post.countLabel)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await unlinkPostAction(itemId, post.id)
                    router.refresh()
                  })
                }
                className="shrink-0 rounded-field px-2 py-0.5 text-small text-muted hover:bg-track hover:text-ink disabled:opacity-50"
                /* Отвязка не трогает само обращение: это разрыв связи,
                   а не удаление запроса человека. */
                title="Отвязать от работы"
              >
                Отвязать
              </button>
            </li>
          ))}
        </ul>
      )}

      <LinkSearch itemId={itemId} />
    </section>
  )
}

function LinkSearch({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [pending, startTransition] = useTransition()
  /* Каждый ввод отменяет предыдущий: иначе медленный ранний ответ
     перезатирает свежий, и в списке оказываются чужие результаты. */
  const attempt = useRef(0)

  useEffect(() => {
    const search = query.trim()
    if (search.length < 2) return

    const mine = ++attempt.current
    const timer = setTimeout(async () => {
      const found = await searchCandidatesAction(itemId, search)
      if (mine === attempt.current) setResults(found)
    }, 250)

    return () => clearTimeout(timer)
  }, [query, itemId])

  /* Список чистится при вводе, а не в эффекте: пока человек стирает запрос,
     под полем не должны висеть результаты от прошлой строки. */
  const onQueryChange = (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      attempt.current++
      setResults([])
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor="link-search" className="sr-only">
        Найти обращение
      </label>
      <input
        id="link-search"
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Привязать обращение: начните вводить заголовок"
        className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
      />

      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-card border border-line bg-surface">
          {results.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await linkPostAction(itemId, candidate.id)
                    setQuery('')
                    setResults([])
                    router.refresh()
                  })
                }
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-track disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate text-small text-ink">
                  {candidate.title}
                </span>
                <span className="shrink-0 text-small text-faint">{candidate.boardName}</span>
                <span className="tnum shrink-0 text-small text-muted">
                  {formatCount(candidate.voteCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
