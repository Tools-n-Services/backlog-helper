import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import { catalog, loadCatalog } from '@/core/catalog'
import { formatCount } from '@/core/content'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Типы обращений', robots: { index: false } }

/**
 * Типы обращений и их формы (В3, docs/09-install.md).
 *
 * Экран отвечает на один вопрос: что портал спрашивает у пришедшего человека.
 * Поэтому в списке видно не количество настроек, а состав формы — то, что
 * увидит он, а не то, что удобно администратору.
 */
export default async function TypesPage() {
  const [viewer] = await Promise.all([getViewer(), loadCatalog()])
  if (!can(viewer, 'settings.edit')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Формы обращений правит администратор портала.</p>
      </StateScreen>
    )
  }

  return (
    <div className="mx-auto max-w-page px-4 py-6">
      <h1 className="text-h2 font-extrabold tracking-tight text-ink">Типы обращений</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        От типа зависят поля формы, набор статусов и приватность. Состав полей
        правится здесь и применяется к порталу сразу — пересобирать ничего
        не нужно.
      </p>

      <ul className="mt-6 space-y-2.5">
        {catalog().types.map((type) => (
          <li key={type.key}>
            <Link
              href={`/admin/types/${type.key}` as Route}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-line bg-surface p-4 transition-shadow hover:shadow-flat"
            >
              <span className="text-h3 font-bold text-ink">{type.name}</span>
              <span className="font-mono text-label uppercase text-faint">{type.key}</span>
              {!type.enabled && (
                <span className="text-small font-semibold text-faint">выключен</span>
              )}
              <span className="ml-auto tnum text-small text-muted">
                {formatCount(type.formSchema.length)} полей
              </span>
              <span className="basis-full text-small text-muted">
                {type.formSchema.map((f) => f.label).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
