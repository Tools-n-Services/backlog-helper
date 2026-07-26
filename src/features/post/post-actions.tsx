'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * Действия над обращением: подписка (FR-142) и копирование ссылки (FR-143).
 *
 * Микрокопирайт по 07-ui-brief.md, раздел 7: кнопка называет действие,
 * подтверждение называет результат — «Скопировать ссылку» → «Скопировано».
 */
export function PostActions({
  subscribed: initialSubscribed,
  signedIn,
}: {
  subscribed: boolean
  signedIn: boolean
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [copied, setCopied] = useState(false)

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
          onClick={() => setSubscribed((s) => !s)}
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
