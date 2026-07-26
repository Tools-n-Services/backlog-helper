'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatCount, plural } from '@/core/content'
import type { PostTypeView } from '@/queries/types'

/**
 * Кнопка голоса со счётчиком (FR-118, FR-132).
 *
 * Голос — переключатель, а не инкремент: повторное нажатие снимает свой голос
 * и вернуть счётчик обязано ровно к исходному. В фазе B гарантию даёт уникальный
 * индекс `(post_id, user_id)` в БД, а не проверка в коде (NFR-03) — здесь же
 * важно, чтобы этого не нарушал сам интерфейс.
 *
 * Обновление оптимистичное: ответа сервера не ждём, иначе на ленте из двадцати
 * карточек голосование ощущается сломанным.
 */
export function VoteControl({
  count,
  type,
  voted: initialVoted,
  signedIn,
  variant = 'card',
}: {
  count: number
  type: PostTypeView
  voted: boolean
  signedIn: boolean
  variant?: 'card' | 'page'
}) {
  const [voted, setVoted] = useState(initialVoted)

  const shown = count + (voted === initialVoted ? 0 : voted ? 1 : -1)
  const wide = variant === 'page'

  const shell =
    'flex shrink-0 flex-col items-center justify-center rounded-card border text-center transition-colors ' +
    (wide ? 'w-[108px] px-3 py-4' : 'w-[74px] px-2 py-3')

  if (!type.allowsVotes) {
    return (
      <div className={`${shell} border-line`}>
        <span aria-hidden className="text-h3 font-light text-faint">
          —
        </span>
        <span className="mt-0.5 text-[11px] leading-tight text-faint">
          без голосов
        </span>
      </div>
    )
  }

  const label = `${formatCount(shown)} ${plural(shown, type.countLabel)}`

  /* Не авторизован — ведёт на вход, а не молчит (07-ui-brief.md, раздел 4). */
  if (!signedIn) {
    return (
      <Link
        href="/login"
        aria-label={`${type.voteLabel}. Сейчас ${label}. Нужен вход`}
        className={`${shell} border-line bg-surface text-ink hover:border-ink`}
      >
        <Chevron />
        <Count value={shown} wide={wide} />
        <Caption>{plural(shown, type.countLabel)}</Caption>
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setVoted((v) => !v)}
      aria-pressed={voted}
      aria-label={`${type.voteLabel}. Сейчас ${label}`}
      className={
        `${shell} ` +
        (voted
          ? 'border-ink bg-ink text-surface'
          : 'border-line bg-surface text-ink hover:border-ink')
      }
    >
      <Chevron />
      <Count value={shown} wide={wide} />
      <Caption tone={voted ? 'on' : 'off'}>
        {voted ? 'вы за' : plural(shown, type.countLabel)}
      </Caption>
    </button>
  )
}

function Chevron() {
  return (
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
  )
}

function Count({ value, wide }: { value: number; wide: boolean }) {
  return (
    <span
      className={`tnum font-bold leading-none ${wide ? 'text-h2' : 'text-h3'}`}
    >
      {formatCount(value)}
    </span>
  )
}

function Caption({
  children,
  tone = 'off',
}: {
  children: React.ReactNode
  tone?: 'on' | 'off'
}) {
  return (
    <span
      className={`mt-1 text-[11px] leading-tight ${tone === 'on' ? 'opacity-80' : 'text-faint'}`}
    >
      {children}
    </span>
  )
}
