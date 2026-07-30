import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { catalog, loadCatalog } from '@/core/catalog'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { FieldEditor } from '@/features/schema/field-editor'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Форма типа', robots: { index: false } }

export default async function TypeSchemaPage({
  params,
}: PageProps<'/admin/types/[key]'>) {
  const [{ key }, viewer] = await Promise.all([params, getViewer(), loadCatalog()])
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

  const type = catalog().typeByKey.get(key)
  if (!type) notFound()

  return (
    <div className="mx-auto max-w-[52rem] px-4 py-6">
      <nav className="mb-3 flex flex-wrap items-center gap-2 text-small text-faint">
        <Link href="/admin/types" className="hover:text-ink">
          Типы обращений
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{type.name}</span>
      </nav>

      <h1 className="text-h2 font-extrabold tracking-tight text-ink">{type.name}</h1>

      <div className="mt-6">
        <FieldEditor typeKey={type.key} typeName={type.name} initial={type.formSchema} />
      </div>
    </div>
  )
}
