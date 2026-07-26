import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { product } from '@config/product'
import { formatCount, plural } from '@/core/content'
import { queries } from '@/queries'
import { StatusBadge } from '@/ui/primitives/status-badge'
import type { RoadmapCardView, RoadmapColumnView } from '@/queries/types'

export const metadata: Metadata = {
  title: 'Что делаем',
  description: 'Что запланировано, что в работе и что уже вышло.',
}

/**
 * Роадмап (FR-151): колонки по статусам, агрегирует обращения со всех досок.
 *
 * Какие статусы становятся колонками — конфиг продукта (`showOnRoadmap`),
 * а не список в коде: у разных продуктов рабочий процесс разный.
 */
export default async function RoadmapPage({ searchParams }: PageProps<'/roadmap'>) {
  if (!product.features.roadmap) notFound()

  const { board, expand } = await searchParams
  const boardSlug = Array.isArray(board) ? board[0] : board
  const expandKey = Array.isArray(expand) ? expand[0] : expand
  const roadmap = await queries.getRoadmap(boardSlug, expandKey)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-12 md:px-8 lg:px-10">
      <h1 className="max-w-[16ch] text-h1 font-light text-ink md:text-display">
        Что мы делаем <span className="font-extrabold">сейчас и дальше</span>
      </h1>
      <p className="mt-5 max-w-[52ch] text-body-l text-muted">
        Планы могут меняться. Дата появляется, когда работа началась.
      </p>

      <nav aria-label="Фильтр по доске" className="mt-8 flex flex-wrap gap-2">
        <BoardTab href="/roadmap" active={!boardSlug}>
          Все доски
        </BoardTab>
        {roadmap.boards.map((b) => (
          <BoardTab
            key={b.slug}
            href={`/roadmap?board=${b.slug}` as Route}
            active={boardSlug === b.slug}
          >
            {b.name}
          </BoardTab>
        ))}
      </nav>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {roadmap.columns.map((column) => (
          <Column key={column.status.key} column={column} boardSlug={boardSlug} />
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
}: {
  column: RoadmapColumnView
  boardSlug: string | undefined
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
        <StatusBadge status={column.status} />
        <span className="tnum text-small text-faint">{formatCount(column.total)}</span>
      </header>

      {column.items.length === 0 ? (
        <p className="py-6 text-center text-small text-faint">
          Пока пусто. Здесь появятся обращения, когда команда возьмёт их в работу.
        </p>
      ) : (
        <ul className="space-y-3">
          {column.items.map((item) => (
            <li key={`${item.boardSlug}/${item.slug}`}>
              <Card item={item} />
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
          {column.expanded ? 'Свернуть' : `Показать все ${formatCount(column.total)}`}
        </Link>
      )}
    </section>
  )
}

function Card({ item }: { item: RoadmapCardView }) {
  return (
    <article className="border-t border-line pt-3">
      <p className="mb-1 text-small text-faint">
        {item.typeName}
        {item.categoryName && ` · ${item.categoryName}`}
      </p>
      <h3 className="text-body font-semibold text-ink">
        <Link href={`/${item.boardSlug}/p/${item.slug}`} className="hover:text-ink-hover">
          {item.title}
        </Link>
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-faint">
        <span className="tnum">
          {formatCount(item.count)} {plural(item.count, item.countLabel)}
        </span>
        {item.eta && <span className="text-muted">{item.eta}</span>}
      </div>
    </article>
  )
}
