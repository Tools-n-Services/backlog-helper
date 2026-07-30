'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  fill,
  formatCount,
  localizedForms,
  plural,
  type Dictionary,
  type Locale,
} from '@/core/content'
import { StatusBadge } from '@/ui/primitives/status-badge'
import { voteAction } from '@/features/post/actions'
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
  t,
  lang,
}: {
  candidates: SimilarPostView[]
  searching: boolean
  t: Dictionary
  lang: Locale
}) {
  if (searching && candidates.length === 0) {
    return (
      <p className="mt-2 text-small text-faint" aria-live="polite">
        {t.intake.searchingSimilar}
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
        {fill(t.intake.similarFound, {
          count: formatCount(candidates.length, lang),
          label: plural(candidates.length, t.common.posts, lang),
        })}
      </p>
      <p className="mt-0.5 text-small text-faint">{t.intake.similarHint}</p>

      <ul className="mt-3 space-y-2">
        {candidates.map((post) => (
          <li key={post.slug}>
            <SimilarCard post={post} t={t} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SimilarCard({
  post,
  t,
  lang,
}: {
  post: SimilarPostView
  t: Dictionary
  lang: Locale
}) {
  const router = useRouter()
  const [voted, setVoted] = useState(post.voted)
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  const count =
    serverCount ?? post.count + (voted === post.voted ? 0 : voted ? 1 : -1)

  /* Голос отсюда — обычный голос, а не отметка в форме: человек пришёл
     создавать обращение, увидел своё же в списке и передумал. Именно ради
     этого врезка и существует, поэтому она обязана дойти до базы. */
  const vote = () => {
    const next = !voted
    setVoted(next)
    setServerCount(null)

    startTransition(async () => {
      const result = await voteAction(post.id)
      if (result.ok) {
        setVoted(result.voted)
        setServerCount(result.count)
        return
      }
      setVoted(!next)
      if (result.reason === 'unauthorized') router.push('/login')
    })
  }

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
          <StatusBadge status={post.status} size="sm" lang={lang} />
          <span className="tnum">
            {formatCount(count, lang)}{' '}
            {plural(
              count,
              localizedForms(post.type.countLabel, post.type.countLabelEn, lang),
              lang,
            )}
          </span>
          {post.commentCount > 0 && (
            <span className="tnum">
              {formatCount(post.commentCount, lang)}{' '}
              {plural(post.commentCount, t.common.commentForms, lang)}
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
          onClick={vote}
          aria-pressed={voted}
          className={
            'shrink-0 rounded-pill px-3.5 py-1.5 text-small font-semibold transition-colors ' +
            (voted
              ? 'bg-ink text-surface'
              : 'border border-line text-ink-2 hover:bg-track')
          }
        >
          {voted ? t.intake.voteDone : t.intake.voteFor}
        </button>
      )}
    </article>
  )
}
