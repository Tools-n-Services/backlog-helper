import Link from 'next/link'

import { product } from '@config/product'
import { t } from '@/core/content'

/**
 * Главная: список досок. Счётчики обращений появятся в итерации A1,
 * когда заработает слой queries.
 */
export default function HomePage() {
  const boards = product.boards
    .filter((b) => !b.hiddenFromNav && b.visibility !== 'private')
    .sort((a, b) => a.position - b.position)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-14 md:px-8 lg:px-10">
      <p className="mb-5 flex items-center gap-2.5 font-mono text-label uppercase text-faint">
        <span className="inline-block size-2.5 rounded-pill bg-ink" />
        {t.home.eyebrow}
      </p>

      <h1 className="max-w-[18ch] text-h1 font-light text-ink md:text-display">
        {t.home.titleLight}{' '}
        <span className="font-extrabold">{t.home.titleBold}</span>
      </h1>

      <p className="mt-5 max-w-[52ch] text-body-l text-muted">{t.home.lead}</p>

      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <li key={board.slug}>
            <Link
              href={`/${board.slug}`}
              className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-shadow hover:shadow-flat"
            >
              <span className="text-h3 font-bold text-ink">{board.name}</span>
              <span className="mt-2 text-small text-muted">
                {board.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
