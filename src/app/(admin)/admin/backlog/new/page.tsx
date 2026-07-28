import type { Metadata } from 'next'
import Link from 'next/link'

import { listThemes } from '@/core/domain/backlog/options'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { createItemAction } from '@/features/backlog/actions'
import { ItemFields } from '@/features/backlog/item-fields'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Новая работа', robots: { index: false } }

/**
 * Работа заводится и без единого обращения (FR-605).
 *
 * Это не частный случай, а условие того, что бэклог отражает реальность:
 * техдолг и требования регулятора никто не запрашивает через портал,
 * но они конкурируют за то же время команды.
 */
export default async function NewBacklogItemPage() {
  const viewer = await getViewer()
  if (!can(viewer, 'triage.decide')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Бэклог ведёт команда продукта.</p>
      </StateScreen>
    )
  }

  const themes = await listThemes()

  return (
    <div className="mx-auto max-w-[70ch] px-4 py-6">
      <Link href="/admin/backlog" className="text-small text-muted hover:text-ink">
        ← Бэклог
      </Link>
      <h1 className="mt-2 mb-1 text-h3 font-bold text-ink">Завести работу</h1>
      <p className="mb-5 text-small text-muted">
        Элемент бэклога — единица работы команды, а не обращение пользователя.
        Обращения к нему привязываются потом, и их может не быть вовсе.
      </p>

      <form action={createItemAction}>
        <ItemFields themes={themes} />
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface hover:bg-ink-hover"
          >
            Создать
          </button>
          <Link href="/admin/backlog" className="text-small text-muted hover:text-ink">
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
