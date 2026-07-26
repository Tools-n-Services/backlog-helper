/**
 * Состояние ленты живёт в URL (FR-117): ссылку можно расшарить и открыть заново.
 * Разбор и сборка — в одном месте, чтобы серверный рендер и клиентские переходы
 * не разошлись в трактовке параметров.
 */

import type { Route } from 'next'

import type { FeedQuery, FeedSort } from '@/queries/types'

export const SORTS: { key: FeedSort; label: string }[] = [
  { key: 'trending', label: 'Популярные' },
  { key: 'top', label: 'Топ' },
  { key: 'new', label: 'Новые' },
]

export type RawSearchParams = Record<string, string | string[] | undefined>

function readList(value: string | string[] | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
}

function readOne(value: string | string[] | undefined): string {
  if (!value) return ''
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export function parseFeedQuery(
  boardSlug: string,
  params: RawSearchParams,
  defaultSort: FeedSort = 'trending',
): FeedQuery {
  const sortRaw = readOne(params['sort'])
  const sort = SORTS.some((s) => s.key === sortRaw)
    ? (sortRaw as FeedSort)
    : defaultSort

  return {
    boardSlug,
    sort,
    statusKeys: readList(params['status']),
    typeKeys: readList(params['type']),
    categorySlugs: readList(params['category']),
    search: readOne(params['q']),
  }
}

/** Сборка URL ленты. Пустые параметры не пишем — ссылка должна быть читаемой. */
export function feedHref(query: FeedQuery, defaultSort: FeedSort = 'trending'): Route {
  const sp = new URLSearchParams()
  if (query.sort !== defaultSort) sp.set('sort', query.sort)
  if (query.statusKeys.length) sp.set('status', query.statusKeys.join(','))
  if (query.typeKeys.length) sp.set('type', query.typeKeys.join(','))
  if (query.categorySlugs.length) sp.set('category', query.categorySlugs.join(','))
  if (query.search) sp.set('q', query.search)

  const qs = sp.toString()
  return (qs ? `/${query.boardSlug}?${qs}` : `/${query.boardSlug}`) as Route
}

export type FacetDimension = 'status' | 'type' | 'category'

const DIMENSION_FIELD = {
  status: 'statusKeys',
  type: 'typeKeys',
  category: 'categorySlugs',
} as const

/** Переключение одного значения мультифильтра. */
export function toggleFacet(
  query: FeedQuery,
  dimension: FacetDimension,
  key: string,
): FeedQuery {
  const field = DIMENSION_FIELD[dimension]
  const current = query[field]
  const next = current.includes(key)
    ? current.filter((k) => k !== key)
    : [...current, key]
  return { ...query, [field]: next }
}

export function clearFacets(query: FeedQuery): FeedQuery {
  return { ...query, statusKeys: [], typeKeys: [], categorySlugs: [], search: '' }
}

export function hasAnyFilter(query: FeedQuery): boolean {
  return Boolean(
    query.statusKeys.length ||
      query.typeKeys.length ||
      query.categorySlugs.length ||
      query.search,
  )
}
