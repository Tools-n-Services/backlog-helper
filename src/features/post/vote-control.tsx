'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { formatCount, plural } from '@/core/content'
import type { PostTypeView } from '@/queries/types'

import { voteAction } from './actions'

/**
 * Кнопка голоса со счётчиком (FR-118, FR-132).
 *
 * Голос — переключатель, а не инкремент: повторное нажатие снимает свой голос
 * и вернуть счётчик обязано ровно к исходному. Гарантию даёт уникальный
 * индекс `(post_id, user_id)` в базе, а не проверка в коде (NFR-03) — здесь
 * важно лишь, чтобы этого не нарушал сам интерфейс.
 *
 * Обновление оптимистичное: ответа сервера не ждём, иначе на ленте из двадцати
 * карточек голосование ощущается сломанным.
 */
export function VoteControl({
  postId,
  count,
  type,
  voted: initialVoted,
  signedIn,
  variant = 'card',
}: {
  postId: string
  count: number
  type: PostTypeView
  voted: boolean
  signedIn: boolean
  variant?: 'card' | 'page'
}) {
  const router = useRouter()
  const [voted, setVoted] = useState(initialVoted)
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  /**
   * Номер последнего отправленного запроса.
   *
   * Кнопку жмут быстрее, чем отвечает сервер, и ответы возвращаются
   * в произвольном порядке. Без этого счётчика поздний ответ на ранний
   * клик затирает результат позднего, и после чётного числа нажатий
   * на экране остаётся нечётное состояние.
   */
  const attempt = useRef(0)

  /* Пока сервер не ответил, счётчик показывается предположительно; после
     ответа — то, что реально в базе. Расхождение возможно и нормально:
     за секунду между кликами кто-то ещё мог проголосовать. */
  const shown =
    serverCount ?? count + (voted === initialVoted ? 0 : voted ? 1 : -1)
  const wide = variant === 'page'

  const submit = () => {
    const next = !voted
    const mine = ++attempt.current
    setVoted(next)
    setServerCount(null)

    startTransition(async () => {
      const result = await voteAction(postId)
      /* Пришёл ответ на устаревший клик — он уже ничего не значит. */
      if (mine !== attempt.current) return

      if (result.ok) {
        setVoted(result.voted)
        setServerCount(result.count)
        return
      }
      /* Откатываем: голос не учтён, и показывать обратное нечестно. */
      setVoted(!next)
      if (result.reason === 'unauthorized') router.push('/login')
    })
  }

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
      onClick={submit}
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
