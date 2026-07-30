'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Locale } from '@/core/content'

import { setLocaleAction } from './actions'

/**
 * Переключатель языка в шапке.
 *
 * Два коротких переключателя, а не выпадающий список: языков два, и список
 * из двух пунктов, который нужно сначала раскрыть, — лишний шаг ради
 * экономии сорока пикселей.
 */
export function LanguageSwitch({
  current,
  options,
  label,
}: {
  current: Locale
  options: { key: Locale; name: string }[]
  label: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center rounded-pill bg-track p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={pending}
          aria-pressed={current === option.key}
          onClick={() =>
            startTransition(async () => {
              await setLocaleAction(option.key)
              router.refresh()
            })
          }
          className={
            'rounded-pill px-2 py-0.5 text-small font-semibold transition-colors disabled:opacity-60 ' +
            (current === option.key
              ? 'bg-surface text-ink'
              : 'text-muted hover:text-ink')
          }
        >
          {option.key.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
