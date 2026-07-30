import type { Metadata } from 'next'

import { catalog, loadCatalog } from '@/core/catalog'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { StatusesEditor } from '@/features/settings/catalog-editors'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Статусы', robots: { index: false } }

export default async function StatusesPage() {
  const [viewer] = await Promise.all([getViewer(), loadCatalog()])
  if (!can(viewer, 'settings.edit')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Статусы обращений правит администратор.</p>
      </StateScreen>
    )
  }

  return (
    <div className="mx-auto max-w-[46rem] px-4 py-6">
      <h1 className="text-h2 font-extrabold tracking-tight text-ink">Статусы</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Публичные стадии обращения. Ключ после сохранения не меняется — он стоит
        в истории переходов; статус с обращениями не удаляется.
      </p>
      <div className="mt-7">
        <StatusesEditor initial={catalog().statuses} />
      </div>
    </div>
  )
}
