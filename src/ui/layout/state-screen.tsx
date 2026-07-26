import Link from 'next/link'
import type { Route } from 'next'

/**
 * Каркас служебного экрана (07-ui-brief.md, раздел 5).
 *
 * Два правила, ради которых он существует:
 * отказ всегда содержит причину и следующий шаг; иллюстрации нет — из пустого
 * экрана выводит кнопка, а не картинка.
 */
export function StateScreen({
  eyebrow,
  title,
  code,
  children,
  actions,
  note,
}: {
  eyebrow?: string
  title: React.ReactNode
  /** Крупный код вроде «404» — если он что-то объясняет. */
  code?: string
  children: React.ReactNode
  actions?: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-page px-5 py-24 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[52ch] text-center">
        {code && (
          <p className="mb-4 font-mono text-h1 font-semibold text-line">{code}</p>
        )}
        {eyebrow && (
          <p className="mb-4 font-mono text-label uppercase text-faint">{eyebrow}</p>
        )}
        <h1 className="text-h2 font-extrabold tracking-tight text-ink">{title}</h1>
        <div className="mt-4 space-y-3 text-body-l leading-relaxed text-muted">
          {children}
        </div>
        {actions && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
        )}
        {note && <p className="mt-6 text-small text-faint">{note}</p>}
      </div>
    </div>
  )
}

export function PrimaryAction<T extends string>({
  href,
  children,
}: {
  href: Route<T>
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
    >
      {children}
    </Link>
  )
}

export function SecondaryAction<T extends string>({
  href,
  children,
}: {
  href: Route<T>
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="rounded-pill border border-line px-5 py-2.5 text-small font-semibold text-ink-2 transition-colors hover:bg-track"
    >
      {children}
    </Link>
  )
}
