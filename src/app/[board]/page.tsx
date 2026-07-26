import type { FeedQuery } from '@/queries/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { formatCount, plural } from '@/core/content'
import { FeedList } from '@/features/feed/feed-list'
import { FilterPanel } from '@/features/feed/filter-panel'
import {
  clearFacets,
  feedHref,
  hasAnyFilter,
  parseFeedQuery,
} from '@/features/feed/query-params'
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
  const board = await queries.getBoard(slug)
  if (!board) notFound()

  const viewer = await getViewer()

  /* Закрытая доска — не 404: отказ обязан называть причину и следующий шаг
     (07-ui-brief.md, раздел 5). «Не найдено» здесь просто врёт. */
  if (board.visibility === 'private' && !viewer.isTeam) {
    return (
      <StateScreen
        title="Доска закрыта"
        actions={
          <>
            <PrimaryAction href="/login">Войти</PrimaryAction>
            <SecondaryAction href="/">Открытые доски</SecondaryAction>
          </>
        }
      >
        <p>
          Доска «{board.name}» доступна только сотрудникам компаний с платным
          тарифом. Если у вас есть доступ — войдите под рабочей почтой.
        </p>
      </StateScreen>
    )
  }

  const searchParamsValue = await searchParams
  /* Способ показать состояние «лента не загрузилась» в прототипе.
     Удаляется в B1 вместе с переходом на настоящий источник данных. */
  if (searchParamsValue['fail']) {
    throw new Error('Не удалось получить ленту: превышено время ожидания')
  }

  const query = parseFeedQuery(slug, searchParamsValue)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-10 md:px-8 lg:px-10">
      <nav
        aria-label="Хлебные крошки"
        className="mb-4 flex items-center gap-2 text-small text-faint"
      >
        <Link href="/" className="hover:text-ink">
          Все доски
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{board.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[52ch]">
          <h1 className="text-h2 font-extrabold tracking-tight text-ink">
            {board.name}
          </h1>
          <p className="mt-2 text-body text-muted">{board.description}</p>
        </div>
        <Link
          href={`/${board.slug}/new`}
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
        >
          Создать обращение
        </Link>
      </div>

      <div className="mt-9">
        {/* Suspense вокруг выборки, а не loading.tsx на весь сегмент: заголовок
            доски виден сразу, скелет держит форму только у ленты. */}
        <Suspense key={feedHref(query)} fallback={<FeedSkeleton />}>
          <Feed query={query} boardSlug={board.slug} canVote={canContribute(viewer)} />
        </Suspense>
      </div>
    </div>
  )
}

async function Feed({
  query,
  boardSlug,
  canVote,
}: {
  query: FeedQuery
  boardSlug: string
  canVote: boolean
}) {
  const feed = await queries.getFeed(query)

  return (
    <div className="grid gap-8 lg:grid-cols-[212px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <FilterPanel query={query} facets={feed.facets} />
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <p className="text-body text-muted">
            <span className="tnum font-semibold text-ink">
              {formatCount(feed.total)}
            </span>{' '}
            {plural(feed.total, ['обращение', 'обращения', 'обращений'])}
          </p>
          <SortTabs query={query} defaultSort="trending" />
        </div>

        {feed.items.length === 0 ? (
          hasAnyFilter(query) ? (
            <EmptyState
              title="Под эти фильтры ничего не подошло"
              hint="Попробуйте снять часть условий — возможно, нужное обращение лежит в другом статусе или категории."
              actionLabel="Сбросить фильтры"
              actionHref={feedHref(clearFacets(query))}
            />
          ) : (
            <EmptyState
              title="Здесь пока ничего нет"
              hint="Эта доска только открылась. Первое обращение задаёт тон остальным — расскажите, что стоит улучшить."
              actionLabel="Создать обращение"
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
          />
        )}
      </section>
    </div>
  )
}
