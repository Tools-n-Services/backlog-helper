import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'

export const metadata: Metadata = { title: 'Портал установлен', robots: { index: false } }

/**
 * Что делать сразу после установки (В4, docs/09-install.md).
 *
 * Отдельная страница, а не последний шаг мастера: как только установка
 * завершена, сам мастер перестаёт существовать — и «Готово», нарисованное
 * на его странице, стирается первым же обновлением. Человек в этот момент
 * ещё не знает ни про воркер, ни про копии.
 *
 * Открыта только владельцу: он к этому моменту уже вошёл, а посторонним
 * читать чек-лист чужой установки незачем.
 */
export default async function InstallDonePage() {
  const viewer = await getViewer()
  if (!can(viewer, 'user.role')) notFound()

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-14 md:px-8">
      <p className="font-mono text-label uppercase text-faint">Установка завершена</p>
      <h1 className="mt-3 text-h1 font-light text-ink">
        Портал <span className="font-extrabold">установлен</span>
      </h1>
      <p className="mt-5 text-body-l text-muted">
        Вы вошли как владелец. Мастер закрыт навсегда — открыть его снова можно
        только командой из консоли.
      </p>

      <ul className="mt-7 space-y-2.5">
        <Todo>
          Запустите воркер: без него письма встают в очередь и молча никуда
          не уходят. Это самая дорогая ошибка первой установки — выглядит она
          как проблема почтового канала.
        </Todo>
        <Todo>
          Настройте резервное копирование базы и один раз проверьте
          восстановление: копия, из которой ни разу не восстанавливались, —
          это не копия.
        </Todo>
        <Todo>
          Остальное — доски, статусы, поля форм, оформление — в админке.
          Пересобирать ничего не нужно.
        </Todo>
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface"
        >
          Открыть портал
        </Link>
        <Link
          href="/admin/types"
          className="rounded-pill border border-line px-5 py-2.5 text-small font-semibold text-ink-2"
        >
          Настроить подробно
        </Link>
      </div>
    </div>
  )
}

function Todo({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 rounded-card border border-line bg-surface p-4 text-body text-ink-2">
      <span aria-hidden className="text-faint">
        —
      </span>
      <span>{children}</span>
    </li>
  )
}
