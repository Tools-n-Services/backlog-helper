import type { Metadata } from 'next'

import { listPeople } from '@/core/domain/people/manage'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { PeopleTable } from '@/features/people/people-table'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Люди', robots: { index: false } }

/**
 * Люди портала (FR-204, FR-232).
 *
 * До этого экрана роль и блокировка правились только запросом в базу —
 * то есть портал нельзя было передать другому человеку, не открыв консоль.
 */
export default async function PeoplePage({ searchParams }: PageProps<'/admin/people'>) {
  const viewer = await getViewer()

  if (!can(viewer, 'user.ban')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/admin/triage">К очереди триажа</PrimaryAction>}
      >
        <p>Роли и блокировки — уровень администратора портала.</p>
      </StateScreen>
    )
  }

  const params = await searchParams
  const raw = params['q']
  const search = (Array.isArray(raw) ? raw[0] : raw) ?? ''
  const people = await listPeople(search)

  return (
    <>
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-h3 font-bold text-ink">Люди</h1>
        <form className="mt-2 flex items-center gap-2">
          <label htmlFor="people-search" className="sr-only">
            Поиск по людям
          </label>
          <input
            id="people-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Имя или почта"
            className="h-7 w-64 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
          />
          <button
            type="submit"
            className="rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track"
          >
            Найти
          </button>
          <span className="text-small text-faint">
            {/* Список ограничен: две тысячи участников на одном экране
                не нужны никому, нужного человека находят поиском. */}
            показаны первые {people.length}
          </span>
        </form>
      </header>

      <PeopleTable
        people={people}
        canManageRoles={can(viewer, 'user.role')}
        canBan={can(viewer, 'user.ban')}
        currentUserId={viewer.id}
      />
    </>
  )
}
