import Link from 'next/link'

import { settings } from '@/core/settings'
import { isStaff } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { Avatar } from '@/ui/primitives/avatar'
import { StateScreen } from '@/ui/layout/state-screen'
import { PrimaryAction } from '@/ui/layout/state-screen'

/**
 * Админская поверхность.
 *
 * Другой язык, чем у публичной части, и это не вкусовщина: воздух и крупный
 * кегль, уместные в ленте, делают разбор двухсот обращений физически
 * невозможным (07-ui-brief.md, раздел 1). Здесь — компактная шапка,
 * тёмная разметка контуров и шкала плотности `admin`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const viewer = await getViewer()

  /* Доступ по полномочию, а не по признаку «сотрудник команды»: команда —
     это про пометку комментариев, а не про право открыть триаж. */
  if (!isStaff(viewer)) {
    return (
      <StateScreen
        title="Раздел для команды"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>
          Триаж и модерация видны только команде. Если доступ нужен —
          попросите администратора портала выдать роль.
        </p>
      </StateScreen>
    )
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="flex h-11 items-center gap-5 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-pill bg-ink text-[10px] font-bold text-surface">
              {settings().mark}
            </span>
            <span className="text-small font-semibold text-ink">Внутренняя часть</span>
          </Link>

          <nav aria-label="Разделы" className="flex items-center gap-0.5">
            <AdminTab href="/admin/triage" contour="triage">
              Триаж
            </AdminTab>
            <AdminTab href="/admin/moderation" contour="intake">
              Модерация
            </AdminTab>
            <AdminTab href="/admin/backlog" contour="backlog">
              Бэклог
            </AdminTab>
            <AdminTab href="/admin/releases" contour="backlog">
              Релизы
            </AdminTab>
            <AdminTab href="/admin/people" contour="backlog">
              Люди
            </AdminTab>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="text-small text-muted hover:text-ink">
              Публичный портал
            </Link>
            <Avatar initials={viewer.initials} isTeam size="sm" />
          </div>
        </div>
      </header>

      <main id="main">{children}</main>
    </div>
  )
}

function AdminTab({
  href,
  contour,
  children,
}: {
  href:
    | '/admin/triage'
    | '/admin/moderation'
    | '/admin/backlog'
    | '/admin/releases'
    | '/admin/people'
  contour: 'intake' | 'triage' | 'backlog'
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-field px-2.5 py-1 text-small font-semibold text-ink-2 transition-colors hover:bg-track"
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-pill"
        style={{ background: `var(--color-contour-${contour})` }}
      />
      {children}
    </Link>
  )
}
