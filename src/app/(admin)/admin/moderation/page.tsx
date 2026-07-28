import type { Metadata } from 'next'

import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { ModerationQueue } from '@/features/moderation/moderation-queue'
import { queries } from '@/queries'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = {
  title: 'Модерация',
  robots: { index: false },
}

/**
 * Очередь модерации (FR-201).
 *
 * Обращение от нового автора не попадает в ленту до проверки. Без этого
 * экрана оно не попадало бы туда никогда: автор видел бы его только
 * по прямой ссылке и считал, что портал его проглотил.
 */
export default async function ModerationPage() {
  const viewer = await getViewer()

  if (!can(viewer, 'moderation.review')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/admin/triage">К очереди триажа</PrimaryAction>}
      >
        <p>Модерацию ведут модераторы и администраторы.</p>
      </StateScreen>
    )
  }

  const items = await queries.getModerationQueue()

  return (
    <>
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-h3 font-bold text-ink">Модерация</h1>
        <p className="mt-0.5 text-small text-muted">
          Первое обращение каждого нового автора. Дальше он публикуется сразу.
        </p>
      </header>
      <ModerationQueue items={items} />
    </>
  )
}
