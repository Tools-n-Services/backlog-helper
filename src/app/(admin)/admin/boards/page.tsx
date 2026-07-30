import type { Metadata } from 'next'

import { catalog, loadCatalog } from '@/core/catalog'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { BoardsEditor } from '@/features/settings/catalog-editors'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Доски', robots: { index: false } }

export default async function BoardsPage() {
  const [viewer] = await Promise.all([getViewer(), loadCatalog()])
  if (!can(viewer, 'settings.edit')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Доски портала правит администратор.</p>
      </StateScreen>
    )
  }

  return (
    <div className="mx-auto max-w-[46rem] px-4 py-6">
      <h1 className="text-h2 font-extrabold tracking-tight text-ink">Доски</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Порядок в списке — порядок в навигации. Адрес доски после сохранения
        не меняется: он стоит в каждой ссылке на обращение.
      </p>
      <div className="mt-7">
        <BoardsEditor initial={catalog().boards} />
      </div>
    </div>
  )
}
