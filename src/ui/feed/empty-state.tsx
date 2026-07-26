import Link from 'next/link'
import type { Route } from 'next'

/**
 * Пустые состояния (FR-119). Их два, и это разные экраны с разными действиями:
 * доска без обращений зовёт создать, отфильтрованная лента — сбросить фильтр.
 * Иллюстрация вместо действия, которое выводит из пустого экрана, — антипаттерн.
 */
export function EmptyState<T extends string>({
  title,
  hint,
  actionLabel,
  actionHref,
}: {
  title: string
  hint: string
  actionLabel: string
  actionHref: Route<T>
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-h3 font-bold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-body text-muted">{hint}</p>
      <Link
        href={actionHref}
        className="mt-6 inline-block rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
      >
        {actionLabel}
      </Link>
    </div>
  )
}
