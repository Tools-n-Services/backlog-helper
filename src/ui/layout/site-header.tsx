import Link from 'next/link'

import { product } from '@config/product'
import { t } from '@/core/content'

/**
 * Шапка публичного портала. Плотность — шкала `public`.
 * Вёрстка перенесена из design system/Публичный портал - Product.dc.html.
 */
export function SiteHeader() {
  const boards = product.boards
    .filter((b) => !b.hiddenFromNav && b.visibility !== 'private')
    .sort((a, b) => a.position - b.position)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-5 md:px-8 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-field"
          aria-label={product.name}
        >
          <span className="flex size-7 items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-surface">
            {product.mark}
          </span>
          <span className="text-body font-semibold tracking-tight text-ink">
            {product.name}
          </span>
        </Link>

        <nav
          aria-label={t.nav.boards}
          className="hidden min-w-0 items-center gap-1 md:flex"
        >
          {boards.map((board) => (
            <Link
              key={board.slug}
              href={`/${board.slug}`}
              className="rounded-pill px-3 py-1.5 text-body text-muted transition-colors hover:bg-track hover:text-ink"
            >
              {board.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {product.features.roadmap && (
            <Link
              href="/roadmap"
              className="hidden rounded-pill px-3 py-1.5 text-body text-muted transition-colors hover:bg-track hover:text-ink sm:block"
            >
              {t.nav.roadmap}
            </Link>
          )}
          {product.features.changelog && (
            <Link
              href="/changelog"
              className="hidden rounded-pill px-3 py-1.5 text-body text-muted transition-colors hover:bg-track hover:text-ink sm:block"
            >
              {t.nav.changelog}
            </Link>
          )}
          <Link
            href="/login"
            className="rounded-pill bg-ink px-4 py-2 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
          >
            {t.nav.signIn}
          </Link>
        </div>
      </div>
    </header>
  )
}
