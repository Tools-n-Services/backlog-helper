import type { Metadata } from 'next'

import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { loadSettings } from '@/core/settings'
import { ProductForm } from '@/features/settings/product-form'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Настройки', robots: { index: false } }

/**
 * Настройки портала (В5, docs/09-install.md).
 *
 * То же, что спрашивает мастер, плюс то, что в него не поместилось:
 * лимиты, сроки ожидания ответа и оформление. Мастер короткий намеренно —
 * подробности живут здесь, и сюда же он отправляет с последнего экрана.
 */
export default async function SettingsPage() {
  const [viewer, settings] = await Promise.all([getViewer(), loadSettings()])
  if (!can(viewer, 'settings.edit')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Настройки портала правит администратор.</p>
      </StateScreen>
    )
  }

  return (
    <div className="mx-auto max-w-[46rem] px-4 py-6">
      <h1 className="text-h2 font-extrabold tracking-tight text-ink">Настройки портала</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Всё на этой странице применяется сразу — пересобирать ничего не нужно.
      </p>
      <div className="mt-7">
        <ProductForm initial={settings} />
      </div>
    </div>
  )
}
