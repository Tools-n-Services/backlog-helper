/**
 * КОНТРАКТ СЛОЯ ЗАПРОСОВ.
 *
 * Единственное, что UI знает о данных. Реализаций две — mock/ (фаза A)
 * и db/ (фаза B); сигнатуры между ними не различаются.
 *
 * Правило: view-model плоская и готовая к рендеру. Никаких ORM-объектов
 * и ленивых связей наружу — то, что нельзя отдать из мока, нельзя отдать
 * и из Prisma (docs/08-dev-plan.md).
 */

import type { StatusShape } from '@config/statuses'
import type { Privacy } from '@config/post-types'

export interface StatusView {
  key: string
  name: string
  /** Форма маркера: состояние кодируется не только цветом. */
  shape: StatusShape
  isTerminal: boolean
}

export interface PostTypeView {
  key: string
  name: string
  allowsVotes: boolean
  voteLabel: string
  /** Формы слова для счётчика: голоса у идей, затронутые у багов. */
  countLabel: [string, string, string]
}

export interface BoardView {
  slug: string
  name: string
  description: string
  visibility: 'public' | 'private' | 'readonly'
  postCount: number
}

/** Карточка обращения в ленте (FR-118). */
export interface PostCardView {
  id: string
  slug: string
  boardSlug: string
  title: string
  excerpt: string
  type: PostTypeView
  status: StatusView
  categoryName: string | null
  categorySlug: string | null
  /** Голоса у идей, уникальные затронутые у багов (FR-524). */
  count: number
  commentCount: number
  pinned: boolean
  privacy: Privacy
  /** Команда уже ответила — сигнал «обращение не брошено». */
  hasTeamReply: boolean
  /** Обращение ждёт ответа автора (needs_info). */
  awaitingReporter: boolean
  /** Голосовал ли текущий пользователь. */
  voted: boolean
  updatedAt: string
  /** Готовая подпись «3 дн. назад»: считается на сервере, чтобы не разъехалась гидратация. */
  updatedLabel: string
}

export type FeedSort = 'trending' | 'top' | 'new'

/** Значение фильтра со счётчиком — счётчики показываются в панели (FR-113). */
export interface FacetView {
  key: string
  name: string
  count: number
  /** Для иерархических категорий: ключ родителя. */
  parentKey?: string
}

export interface FeedFacets {
  statuses: FacetView[]
  types: FacetView[]
  categories: FacetView[]
}

export interface FeedQuery {
  boardSlug: string
  sort: FeedSort
  statusKeys: string[]
  typeKeys: string[]
  categorySlugs: string[]
  search: string
  /** Курсорная пагинация: offset на живой ленте даёт дубли и пропуски. */
  cursor?: string | undefined
  limit?: number | undefined
}

export interface FeedPage {
  items: PostCardView[]
  /** null — дальше ничего нет. */
  nextCursor: string | null
  /** Всего под текущий фильтр — для «Найдено N» и «Показать ещё N». */
  total: number
}

export interface FeedResult extends FeedPage {
  facets: FeedFacets
}

/** Контракт. Обе реализации обязаны экспортировать ровно это. */
export interface QueryPort {
  listBoards(): Promise<BoardView[]>
  getBoard(slug: string): Promise<BoardView | null>
  getFeed(query: FeedQuery): Promise<FeedResult>
}
