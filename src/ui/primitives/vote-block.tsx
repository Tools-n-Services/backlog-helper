import Link from 'next/link'

import { formatCount, plural } from '@/core/content'
import type { PostTypeView } from '@/queries/types'

/**
 * Счётчик с кнопкой голоса (FR-118, FR-132).
 *
 * Один и тот же голос значит разное: у идеи «мне тоже нужно», у бага
 * «у меня тоже» — подпись приходит из типа обращения, а не из компонента.
 *
 * Состояние «не авторизован» ведёт на вход, а не молчит. Интерактивное
 * голосование появится в итерации A2.
 */
export function VoteBlock({
  count,
  type,
  voted,
}: {
  count: number
  type: PostTypeView
  voted: boolean
}) {
  if (!type.allowsVotes) {
    return (
      <div className="flex w-[74px] shrink-0 flex-col items-center justify-center rounded-card border border-line px-2 py-3 text-center">
        <span aria-hidden className="text-h3 font-light text-faint">
          —
        </span>
        <span className="mt-0.5 text-[11px] leading-tight text-faint">
          без голосов
        </span>
      </div>
    )
  }

  return (
    <Link
      href="/login"
      aria-label={`${type.voteLabel}: ${formatCount(count)} ${plural(count, type.countLabel)}`}
      className={
        'flex w-[74px] shrink-0 flex-col items-center justify-center rounded-card border px-2 py-3 text-center transition-colors ' +
        (voted
          ? 'border-ink bg-ink text-surface'
          : 'border-line bg-surface text-ink hover:border-ink')
      }
    >
      <svg width="11" height="7" viewBox="0 0 12 8" aria-hidden className="mb-1">
        <path
          d="M1 6.6 6 1.6l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="tnum text-h3 font-bold leading-none">
        {formatCount(count)}
      </span>
      <span className="mt-1 text-[11px] leading-tight text-faint">
        {plural(count, type.countLabel)}
      </span>
    </Link>
  )
}
