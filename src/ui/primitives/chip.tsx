import Link from 'next/link'
import type { Route } from 'next'

/** Нейтральный чип: тип обращения, категория, служебные признаки. */
export function Chip<T extends string>({
  children,
  href,
  tone = 'neutral',
}: {
  children: React.ReactNode
  href?: Route<T>
  tone?: 'neutral' | 'quiet'
}) {
  const className =
    'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-small font-semibold ' +
    (tone === 'neutral'
      ? 'bg-track text-ink-2'
      : 'text-faint')

  if (href) {
    return (
      <Link href={href} className={`${className} transition-colors hover:bg-tint`}>
        {children}
      </Link>
    )
  }
  return <span className={className}>{children}</span>
}
