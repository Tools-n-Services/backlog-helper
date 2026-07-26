'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { ViewerRole } from '@/core/session'

import { setViewerRole } from './actions'

/**
 * Переключатель роли для прототипа.
 *
 * УДАЛЯЕТСЯ В ИТЕРАЦИИ B2 вместе с заглушкой сессии — не остаётся «для
 * удобства» (docs/08-dev-plan.md, раздел про сознательные долги).
 *
 * Пока он нужен по делу: состояния «не авторизован» и «аккаунт заблокирован»
 * невозможно ни показать, ни принять без возможности в них попасть.
 */
const ROLES: { key: ViewerRole; label: string }[] = [
  { key: 'guest', label: 'Гость' },
  { key: 'user', label: 'Пользователь' },
  { key: 'team', label: 'Команда' },
  { key: 'banned', label: 'Заблокирован' },
]

export function ViewerSwitcher({ current }: { current: ViewerRole }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-busy={pending}
      data-testid="viewer-switcher"
    >
      <span className="font-mono text-label uppercase text-faint">
        прототип · роль
      </span>
      {ROLES.map((role) => (
        <button
          key={role.key}
          type="button"
          aria-pressed={current === role.key}
          onClick={() =>
            startTransition(async () => {
              await setViewerRole(role.key)
              router.refresh()
            })
          }
          className={
            'rounded-pill px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
            (current === role.key
              ? 'bg-ink text-surface'
              : 'border border-line text-muted hover:bg-track')
          }
        >
          {role.label}
        </button>
      ))}
    </div>
  )
}
