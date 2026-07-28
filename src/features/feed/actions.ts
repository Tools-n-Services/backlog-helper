'use server'

import { getViewer } from '@/core/session'
import { queries } from '@/queries'
import type { FeedPage, FeedQuery } from '@/queries/types'

/**
 * Дозагрузка ленты для «Показать ещё» (FR-116).
 *
 * Курсорная, а не offset: лента меняется под пользователем, и offset даёт
 * дубли и пропуски между страницами.
 */
export async function loadMoreFeed(
  query: FeedQuery,
  cursor: string,
): Promise<FeedPage> {
  const viewer = await getViewer()
  const result = await queries.getFeed(
    { ...query, cursor },
    viewer.signedIn ? viewer.id : undefined,
  )
  return {
    items: result.items,
    nextCursor: result.nextCursor,
    total: result.total,
  }
}
