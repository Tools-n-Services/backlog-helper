import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { settings } from '@/core/settings'
import {
  fill,
  formatCount,
  localized,
  localizedForms,
  plural,
  type Dictionary,
  type Locale,
} from '@/core/content'
import { content, locale } from '@/core/locale'
import { queries } from '@/queries'
import { StatusBadge } from '@/ui/primitives/status-badge'
import type { RoadmapCardView, RoadmapColumnView } from '@/queries/types'

export async function generateMetadata(): Promise<Metadata> {
  const t = await content()
  return { title: t.roadmap.title, description: t.roadmap.description }
}

/**
 * Роадмап (FR-151): колонки по статусам, агрегирует обращения со всех досок.
 *
 * Какие статусы становятся колонками — конфиг продукта (`showOnRoadmap`),
 * а не список в коде: у разных продуктов рабочий процесс разный.
 */
export default async function RoadmapPage({ searchParams }: PageProps<'/roadmap'>) {
  if (!settings().features.roadmap) notFound()

  const [{ board, expand }, t, lang] = await Promise.all([
    searchParams,
    content(),
    locale(),
  ])
  const boardSlug = Array.isArray(board) ? board[0] : board
  const expandKey = Array.isArray(expand) ? expand[0] : expand
  const roadmap = await queries.getRoadmap(boardSlug, expandKey)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-12 md:px-8 lg:px-10">
      <h1 className="max-w-[16ch] text-h1 font-light text-ink md:text-display">
        {t.roadmap.headingLight}{' '}
        <span className="font-extrabold">{t.roadmap.headingBold}</span>
      </h1>
      <p className="mt-5 max-w-[52ch] text-body-l text-muted">{t.roadmap.lead}</p>

      <nav aria-label={t.roadmap.boardFilter} className="mt-8 flex flex-wrap gap-2">
        <BoardTab href="/roadmap" active={!boardSlug}>
          {t.nav.boards}
        </BoardTab>
        {roadmap.boards.map((b) => (
          <BoardTab
            key={b.slug}
            href={`/roadmap?board=${b.slug}` as Route}
            active={boardSlug === b.slug}
          >
            {localized(b.name, b.nameEn, lang)}
          </BoardTab>
        ))}
      </nav>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {roadmap.columns.map((column) => (
          <Column
            key={column.status.key}
            column={column}
            boardSlug={boardSlug}
            t={t}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

function BoardTab({
  href,
  active,
  children,
}: {
  href: Route
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        'rounded-pill px-3.5 py-1.5 text-body font-semibold transition-colors ' +
        (active ? 'bg-ink text-surface' : 'text-muted hover:bg-track hover:text-ink')
      }
    >
      {children}
    </Link>
  )
}

function Column({
  column,
  boardSlug,
  t,
  lang,
}: {
  column: RoadmapColumnView
  boardSlug: string | undefined
  t: Dictionary
  lang: Locale
}) {
  /* Колонка «Готово» бесконечная, поэтому нужен лимит и раскрытие (FR-155).
     Раскрываем на месте, а не ссылкой в ленту доски: роадмап сквозной по всем
     доскам, и такая ссылка потеряла бы часть карточек. */
  const rest = column.total - column.items.length
  const params = new URLSearchParams()
  if (boardSlug) params.set('board', boardSlug)
  if (!column.expanded) params.set('expand', column.status.key)
  const toggleHref = (params.toString() ? `/roadmap?${params}` : '/roadmap') as Route

  return (
    <section className="flex flex-col rounded-card border border-line bg-surface p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <StatusBadge status={column.status} lang={lang} />
        <span className="tnum text-small text-faint">
          {formatCount(column.total, lang)}
        </span>
      </header>

      {column.items.length === 0 ? (
        <p className="py-6 text-center text-small text-faint">{t.roadmap.empty}</p>
      ) : (
        <ul className="space-y-3">
          {column.items.map((item) => (
            <li key={`${item.boardSlug}/${item.slug}`}>
              <Card item={item} lang={lang} />
            </li>
          ))}
        </ul>
      )}

      {(rest > 0 || column.expanded) && (
        <Link
          href={toggleHref}
          scroll={false}
          className="mt-4 rounded-pill border border-line px-4 py-2 text-center text-small font-semibold text-ink-2 transition-colors hover:bg-track"
        >
          {column.expanded
            ? t.roadmap.collapse
            : fill(t.roadmap.showAll, { count: formatCount(column.total, lang) })}
        </Link>
      )}
    </section>
  )
}

function Card({ item, lang }: { item: RoadmapCardView; lang: Locale }) {
  return (
    <article className="border-t border-line pt-3">
      <p className="mb-1 text-small text-faint">
        {localized(item.typeName, item.typeNameEn, lang)}
        {item.categoryName && ` · ${item.categoryName}`}
      </p>
      <h3 className="text-body font-semibold text-ink">
        <Link href={`/${item.boardSlug}/p/${item.slug}`} className="hover:text-ink-hover">
          {item.title}
        </Link>
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-faint">
        <span className="tnum">
          {formatCount(item.count, lang)}{' '}
          {plural(
            item.count,
            localizedForms(item.countLabel, item.countLabelEn, lang),
            lang,
          )}
        </span>
        {item.eta && <span className="text-muted">{item.eta}</span>}
      </div>
    </article>
  )
}
