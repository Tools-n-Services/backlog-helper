import type { Metadata } from 'next'
import Link from 'next/link'

import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { createReleaseAction } from '@/features/releases/actions'
import { ReleaseFields } from '@/features/releases/release-fields'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Новый релиз', robots: { index: false } }

/**
 * Черновик релиза.
 *
 * Запись всегда создаётся неопубликованной: между «начал писать» и «люди
 * получили письма» обязан быть отдельный осознанный шаг. Поэтому здесь
 * только заголовок и вводка — изменения и обращения добавляются на карточке,
 * когда уже видно, что именно вышло.
 */
export default async function NewReleasePage() {
  const viewer = await getViewer()
  if (!can(viewer, 'triage.decide')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Релизы ведёт команда продукта.</p>
      </StateScreen>
    )
  }

  return (
    <div className="mx-auto max-w-[70ch] px-4 py-6">
      <Link href="/admin/releases" className="text-small text-muted hover:text-ink">
        ← Релизы
      </Link>
      <h1 className="mt-2 mb-1 text-h3 font-bold text-ink">Завести релиз</h1>
      <p className="mb-5 text-small text-muted">
        Запись выйдет черновиком: изменения и обращения добавите на карточке,
        а публикация — отдельным шагом. Именно она закроет обращения и отправит
        письма.
      </p>

      <form action={createReleaseAction}>
        <ReleaseFields />
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface hover:bg-ink-hover"
          >
            Создать черновик
          </button>
          <Link href="/admin/releases" className="text-small text-muted hover:text-ink">
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
