'use client'

import { useState, useTransition } from 'react'

import type { PersonRow } from '@/core/domain/people/manage'
import { ACCESS_ROLES, type AccessRole } from '@/core/permissions'

import { banAction, setRoleAction, unbanAction } from './actions'

/**
 * Люди портала: роли и блокировка (FR-204, FR-232).
 *
 * Плотная таблица, как и очередь триажа: список растёт до тысяч строк,
 * и карточки в нём не читаются.
 */
export function PeopleTable({
  people,
  canManageRoles,
  canBan,
  currentUserId,
}: {
  people: PersonRow[]
  canManageRoles: boolean
  canBan: boolean
  currentUserId: string
}) {
  const [rows, setRows] = useState(people)
  const [banning, setBanning] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const patch = (id: string, change: Partial<PersonRow>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)))

  const changeRole = (person: PersonRow, role: AccessRole) => {
    const previous = person.accessRole
    patch(person.id, { accessRole: role, isTeam: role !== 'user' })
    setFailed(null)

    startTransition(async () => {
      const result = await setRoleAction(person.id, role)
      if (result.ok) return
      patch(person.id, { accessRole: previous, isTeam: previous !== 'user' })
      setFailed(message(person, result.reason))
    })
  }

  const ban = (person: PersonRow, reason: string) => {
    patch(person.id, { banned: true, banReason: reason })
    setBanning(null)
    setFailed(null)

    startTransition(async () => {
      const result = await banAction(person.id, reason)
      if (result.ok) return
      patch(person.id, { banned: false, banReason: null })
      setFailed(message(person, result.reason))
    })
  }

  const unban = (person: PersonRow) => {
    const reason = person.banReason
    patch(person.id, { banned: false, banReason: null })
    setFailed(null)

    startTransition(async () => {
      const result = await unbanAction(person.id)
      if (result.ok) return
      patch(person.id, { banned: true, banReason: reason })
      setFailed(message(person, result.reason))
    })
  }

  return (
    <div>
      {failed && (
        <p
          role="alert"
          className="border-b border-line px-4 py-2 text-small"
          style={{ color: 'var(--color-signal-error)' }}
        >
          {failed}
        </p>
      )}

      <table className="w-full border-collapse text-small">
        <caption className="sr-only">Люди портала: роли и блокировка</caption>
        <thead>
          <tr className="border-b border-line text-left text-faint">
            <Th>Человек</Th>
            <Th className="w-40">Роль</Th>
            <Th className="w-20 text-right">Обращений</Th>
            <Th className="w-56">Доступ</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => (
            <tr key={person.id} className="border-b border-line/60 align-top">
              <td className="px-3 py-2">
                <div className="font-semibold text-ink">
                  {person.name}
                  {person.id === currentUserId && (
                    <span className="ml-2 text-small font-normal text-faint">это вы</span>
                  )}
                </div>
                <div className="text-small text-faint">{person.email}</div>
                {person.banned && person.banReason && (
                  <div className="mt-0.5 text-small" style={{ color: 'var(--color-signal-error)' }}>
                    Заблокирован: {person.banReason}
                  </div>
                )}
              </td>

              <td className="px-3 py-2">
                {canManageRoles && person.id !== currentUserId ? (
                  <select
                    aria-label={`Роль: ${person.name}`}
                    value={person.accessRole}
                    onChange={(event) =>
                      changeRole(person, event.target.value as AccessRole)
                    }
                    className="h-7 w-full rounded-field border border-line bg-surface px-1.5 text-small text-ink-2"
                  >
                    {ACCESS_ROLES.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-ink-2">
                    {ACCESS_ROLES.find((r) => r.key === person.accessRole)?.name}
                  </span>
                )}
              </td>

              <td className="tnum px-3 py-2 text-right text-ink-2">{person.posts}</td>

              <td className="px-3 py-2">
                {banning === person.id ? (
                  <BanForm
                    person={person}
                    onCancel={() => setBanning(null)}
                    onSubmit={(reason) => ban(person, reason)}
                  />
                ) : person.banned ? (
                  <button
                    type="button"
                    disabled={!canBan}
                    onClick={() => unban(person)}
                    className="rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track disabled:opacity-40"
                  >
                    Снять блокировку
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canBan || person.id === currentUserId}
                    onClick={() => setBanning(person.id)}
                    className="rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track disabled:opacity-40"
                  >
                    Заблокировать
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="px-4 py-12 text-center text-body text-muted">
          Никого не нашлось. Поиск идёт по имени и адресу почты.
        </p>
      )}
    </div>
  )
}

/** Причина блокировки. Показывается самому заблокированному (FR-204). */
function BanForm({
  person,
  onSubmit,
  onCancel,
}: {
  person: PersonRow
  onSubmit: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const ready = reason.trim().length >= 3

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onSubmit(reason)
      }}
    >
      <label htmlFor={`ban-${person.id}`} className="sr-only">
        Причина блокировки
      </label>
      <input
        id={`ban-${person.id}`}
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        placeholder="Причина — её увидит он сам"
        className="h-7 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2 placeholder:text-faint"
      />
      <div className="mt-1 flex gap-1.5">
        <button
          type="submit"
          disabled={!ready}
          className="rounded-field bg-ink px-2.5 py-1 text-small font-semibold text-surface disabled:opacity-40"
        >
          Заблокировать
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-1.5 font-medium ${className}`}>
      {children}
    </th>
  )
}

function message(person: PersonRow, reason: string): string {
  switch (reason) {
    case 'last-owner':
      return 'Это последний владелец: снять роль некому будет вернуть.'
    case 'self':
      return 'Себе роль не меняют и себя не блокируют — иначе можно закрыть себе доступ.'
    case 'forbidden':
      return `Недостаточно прав для действия над ${person.name}.`
    case 'reason-required':
      return 'Нужна причина блокировки: её увидит заблокированный.'
    default:
      return `Не удалось изменить доступ для ${person.name}.`
  }
}
