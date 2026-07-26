'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatCount, plural } from '@/core/content'
import { StatusBadge } from '@/ui/primitives/status-badge'
import type { SimilarPostView } from '@/queries/types'

/**
 * Врезка «похожие найдены» (FR-122) — главный механизм борьбы со свалкой
 * дубликатов. Смысл в одном: голос за существующее обращение весит больше
 * нового поста, и это нужно сказать прямо.
 *
 * Закрытые как «не будем делать» показываются тоже, вместе с причиной (FR-643):
 * лучший дубликат — тот, который не создали.
 */
export function SimilarInset({
  candidates,
  searching,
}: {
  candidates: SimilarPostView[]
  searching: boolean
}) {
  if (searching && candidates.length === 0) {
    return (
      <p className="mt-2 text-small text-faint" aria-live="polite">
        Ищем похожие…
      </p>
    )
  }

  if (candidates.length === 0) return null

  return (
    <section
      aria-live="polite"
      className="mt-3 rounded-card border border-line bg-track/60 p-4"
    >
      <p className="text-body font-semibold text-ink">
        Похоже, об этом уже писали — {formatCount(candidates.length)}{' '}
        {plural(candidates.length, ['обращение', 'обращения', 'обращений'])}
      </p>
      <p className="mt-0.5 text-small text-faint">
        голос за существующее весит больше нового
      </p>

      <ul className="mt-3 space-y-2">
        {candidates.map((post) => (
          <li key={post.slug}>
            <SimilarCard post={post} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SimilarCard({ post }: { post: SimilarPostView }) {
  const [voted, setVoted] = useState(post.voted)
  const count = post.count + (voted === post.voted ? 0 : voted ? 1 : -1)

  return (
    <article className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/${post.boardSlug}/p/${post.slug}`}
          className="text-body font-semibold text-ink hover:text-ink-hover"
        >
          {post.title}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-faint">
          <StatusBadge status={post.status} size="sm" />
          <span className="tnum">
            {formatCount(count)} {plural(count, post.type.countLabel)}
          </span>
          {post.commentCount > 0 && (
            <span className="tnum">
              {formatCount(post.commentCount)}{' '}
              {plural(post.commentCount, ['комментарий', 'комментария', 'комментариев'])}
            </span>
          )}
        </div>

        {post.closedReason && (
          <p className="mt-2 text-small text-muted">{post.closedReason}</p>
        )}
      </div>

      {post.type.allowsVotes && !post.status.isTerminal && (
        <button
          type="button"
          onClick={() => setVoted((v) => !v)}
          aria-pressed={voted}
          className={
            'shrink-0 rounded-pill px-3.5 py-1.5 text-small font-semibold transition-colors ' +
            (voted
              ? 'bg-ink text-surface'
              : 'border border-line text-ink-2 hover:bg-track')
          }
        >
          {voted ? 'Ваш голос учтён' : 'Голосовать за это'}
        </button>
      )}
    </article>
  )
}
