'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { subscriptionAction } from './actions'

/**
 * Действия над обращением: подписка (FR-142) и копирование ссылки (FR-143).
 *
 * Микрокопирайт по 07-ui-brief.md, раздел 7: кнопка называет действие,
 * подтверждение называет результат — «Скопировать ссылку» → «Скопировано».
 */
export function PostActions({
  postId,
  subscribed: initialSubscribed,
  signedIn,
}: {
  postId: string
  subscribed: boolean
  signedIn: boolean
}) {
  const router = useRouter()
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  const toggle = () => {
    const next = !subscribed
    setSubscribed(next)
    startTransition(async () => {
      const result = await subscriptionAction(postId)
      if (result.ok) {
        setSubscribed(result.subscribed)
        return
      }
      setSubscribed(!next)
      if (result.reason === 'unauthorized') router.push('/login')
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Буфер обмена недоступен — адрес и так виден в строке браузера. */
    }
  }

  const button =
    'rounded-pill border px-3.5 py-1.5 text-small font-semibold transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signedIn ? (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={subscribed}
          className={
            `${button} ` +
            (subscribed
              ? 'border-ink bg-ink text-surface'
              : 'border-line text-ink-2 hover:bg-track')
          }
        >
          {subscribed ? 'Вы следите' : 'Следить за обновлениями'}
        </button>
      ) : (
        <Link href="/login" className={`${button} border-line text-ink-2 hover:bg-track`}>
          Следить за обновлениями
        </Link>
      )}

      <button
        type="button"
        onClick={copy}
        className={`${button} border-line text-ink-2 hover:bg-track`}
      >
        {copied ? 'Скопировано' : 'Скопировать ссылку'}
      </button>
    </div>
  )
}
