import type { FeedQuery } from '@/queries/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { fill, formatCount, localized, plural, type Dictionary, type Locale } from '@/core/content'
import { content, locale } from '@/core/locale'
import { FeedList } from '@/features/feed/feed-list'
import { FilterPanel } from '@/features/feed/filter-panel'
import {
  clearFacets,
  feedHref,
  hasAnyFilter,
  parseFeedQuery,
} from '@/features/feed/query-params'
import { isStaff } from '@/core/permissions'
import { canContribute, getViewer } from '@/core/session'
import { queries } from '@/queries'
import { EmptyState } from '@/ui/feed/empty-state'
import { FeedSkeleton } from '@/ui/feed/feed-skeleton'
import { SortTabs } from '@/ui/feed/sort-tabs'
import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export async function generateMetadata({
  params,
}: PageProps<'/[board]'>): Promise<Metadata> {
  const { board: slug } = await params
  const board = await queries.getBoard(slug)
  if (!board) return {}
  return { title: board.name, description: board.description }
}

export default async function BoardPage({
  params,
  searchParams,
}: PageProps<'/[board]'>) {
  const { board: slug } = await params
  const [board, viewer, t, lang] = await Promise.all([
    queries.getBoard(slug),
    getViewer(),
    content(),
    locale(),
  ])
  if (!board) notFound()

  const boardName = localized(board.name, board.nameEn, lang)

  /* Закрытая доска — не 404: отказ обязан называть причину и следующий шаг
     (07-ui-brief.md, раздел 5). «Не найдено» здесь просто врёт. */
  if (board.visibility === 'private' && !isStaff(viewer)) {
    return (
      <StateScreen
        title={t.feed.closedBoard}
        actions={
          <>
            <PrimaryAction href="/login">{t.nav.signIn}</PrimaryAction>
            <SecondaryAction href="/">{t.feed.openBoards}</SecondaryAction>
          </>
        }
      >
        <p>{fill(t.feed.closedBoardLead, { board: boardName })}</p>
      </StateScreen>
    )
  }

  const searchParamsValue = await searchParams
  /* Экран «лента не загрузилась» — настоящая граница ошибок, и её нужно
     уметь открыть, чтобы проверить текст и кнопку повтора. Вызвать сбой базы
     по требованию нельзя, поэтому здесь ручной триггер.
     
     Условие — режим разработки или явный флаг прогона, а не только первое:
     сценарии ходят и против собранного портала (в CI так надёжнее), а в бою
     ни того, ни другого нет — и триггер остаётся тем, чем должен: способом
     посмотреть на свой же экран, а не уронить чужой. */
  const failureAllowed =
    process.env.NODE_ENV !== 'production' || process.env.E2E_ALLOW_FEED_FAILURE === '1'
  if (failureAllowed && searchParamsValue['fail']) {
    throw new Error('Не удалось получить ленту: превышено время ожидания')
  }

  const query = parseFeedQuery(slug, searchParamsValue)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-10 md:px-8 lg:px-10">
      <nav
        aria-label={t.common.breadcrumbs}
        className="mb-4 flex items-center gap-2 text-small text-faint"
      >
        <Link href="/" className="hover:text-ink">
          {t.nav.boards}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{boardName}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[52ch]">
          <h1 className="text-h2 font-extrabold tracking-tight text-ink">
            {boardName}
          </h1>
          <p className="mt-2 text-body text-muted">
            {localized(board.description, board.descriptionEn, lang)}
          </p>
        </div>
        <Link
          href={`/${board.slug}/new`}
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
        >
          {t.feed.createCta}
        </Link>
      </div>

      <div className="mt-9">
        {/* Suspense вокруг выборки, а не loading.tsx на весь сегмент: заголовок
            доски виден сразу, скелет держит форму только у ленты. */}
        <Suspense key={feedHref(query)} fallback={<FeedSkeleton />}>
          <Feed
            query={query}
            boardSlug={board.slug}
            canVote={canContribute(viewer)}
            t={t}
            lang={lang}
          />
        </Suspense>
      </div>
    </div>
  )
}

async function Feed({
  query,
  boardSlug,
  canVote,
  t,
  lang,
}: {
  query: FeedQuery
  boardSlug: string
  canVote: boolean
  t: Dictionary
  lang: Locale
}) {
  const viewer = await getViewer()
  /* Голоса читателя нужны, чтобы кнопка показывала «вы за», а не предлагала
     проголосовать повторно. */
  const feed = await queries.getFeed(query, viewer.signedIn ? viewer.id : undefined)

  return (
    <div className="grid gap-8 lg:grid-cols-[212px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <FilterPanel query={query} facets={feed.facets} t={t} lang={lang} />
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <p className="text-body text-muted">
            <span className="tnum font-semibold text-ink">
              {formatCount(feed.total, lang)}
            </span>{' '}
            {plural(feed.total, t.common.posts, lang)}
          </p>
          <SortTabs query={query} defaultSort="trending" t={t} />
        </div>

        {feed.items.length === 0 ? (
          hasAnyFilter(query) ? (
            <EmptyState
              title={t.feed.noMatchTitle}
              hint={t.feed.noMatchLead}
              actionLabel={t.feed.resetFilters}
              actionHref={feedHref(clearFacets(query))}
            />
          ) : (
            <EmptyState
              title={t.feed.emptyTitle}
              hint={t.feed.emptyLead}
              actionLabel={t.feed.createCta}
              actionHref={`/${boardSlug}/new`}
            />
          )
        ) : (
          /* key по запросу: список накапливается в useState, и без ремонтирования
             смена фильтра оставила бы на экране прошлую выборку. */
          <FeedList
            key={feedHref(query)}
            query={query}
            initial={feed}
            signedIn={canVote}
            t={t}
            lang={lang}
          />
        )}
      </section>
    </div>
  )
}
