import Link from 'next/link'

import type { Dictionary } from '@/core/content'
import { feedHref, SORTS } from '@/features/feed/query-params'
import type { FeedQuery, FeedSort } from '@/queries/types'

/**
 * Сортировки ленты (FR-111). Ссылки, а не кнопки: сортировка — часть адреса,
 * её должно быть видно в URL и можно открыть в новой вкладке.
 *
 * Набор по умолчанию задаётся типом обращения: у багов trending бессмысленен,
 * поэтому доска багов открывается на другой сортировке (FR-504).
 */
export function SortTabs({
  query,
  defaultSort,
  t,
}: {
  query: FeedQuery
  defaultSort: FeedSort
  t: Dictionary
}) {
  /* Подписи из словаря, а не из query-params: там живёт разбор адреса,
     и тащить туда язык значит тащить словарь в разбор строки запроса. */
  const label: Record<FeedSort, string> = {
    trending: t.feed.sortTrending,
    top: t.feed.sortTop,
    new: t.feed.sortNew,
  }

  return (
    <nav aria-label={t.common.sort} className="flex items-center gap-1">
      {SORTS.map((sort) => {
        const active = query.sort === sort.key
        return (
          <Link
            key={sort.key}
            href={feedHref({ ...query, sort: sort.key }, defaultSort)}
            aria-current={active ? 'true' : undefined}
            className={
              'rounded-pill px-3.5 py-1.5 text-body font-semibold transition-colors ' +
              (active
                ? 'bg-ink text-surface'
                : 'text-muted hover:bg-track hover:text-ink')
            }
          >
            {label[sort.key]}
          </Link>
        )
      })}
    </nav>
  )
}
