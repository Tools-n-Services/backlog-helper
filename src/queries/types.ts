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
  /** Категории доски целиком — форме нужны все, а не только непустые. */
  categories: { slug: string; name: string }[]
  /** Категория обязательна при создании обращения (FR-121). */
  requireCategory: boolean
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

export interface PersonView {
  name: string
  /** Инициалы для аватара-заглушки. */
  initials: string
  role: string
  /** Сотрудник команды: его комментарии визуально отличаются (FR-137). */
  isTeam: boolean
}

/** Комментарий с одним уровнем вложенности ответов (FR-136). */
export interface CommentView {
  id: string
  author: PersonView
  createdAt: string
  createdLabel: string
  body: string
  likeCount: number
  /** Команда прибивает свой ответ наверх треда (FR-138). */
  pinned: boolean
  replies: CommentView[]
}

/** Запись истории статусов (FR-140). */
export interface StatusChangeView {
  status: StatusView
  label: string
  byName: string | null
}

/** Обращение, смерженное в это (FR-141). */
export interface MergedPostView {
  title: string
  slug: string
  ref: string
  movedVotes: number
}

export interface PostDetailView extends PostCardView {
  /** Человекочитаемая ссылка для поддержки: «RTM-4821». */
  ref: string
  /** Тело обращения абзацами. */
  details: string[]
  author: PersonView
  createdAt: string
  createdLabel: string
  /** Ожидаемая дата выхода, если задана командой (FR-134). */
  eta: string | null
  statusHistory: StatusChangeView[]
  /** Первые аватары списка голосовавших (FR-133). */
  voters: PersonView[]
  votersTotal: number
  /** Скрыт настройкой приватности продукта. */
  votersHidden: boolean
  merged: MergedPostView[]
  comments: CommentView[]
  /** Подписан ли текущий пользователь на обновления (FR-142). */
  subscribed: boolean
}

/**
 * Смерженное обращение не открывается молча: пользователю показывается,
 * куда и почему его перенесли (07-ui-brief.md, раздел 5).
 */
export interface PostMergedView {
  title: string
  target: { boardSlug: string; slug: string; title: string }
}

export type PostPageResult =
  | ({ kind: 'post' } & PostDetailView)
  | ({ kind: 'merged' } & PostMergedView)

/** Кандидат во врезке «похожие найдены» (FR-122). */
export interface SimilarPostView {
  slug: string
  boardSlug: string
  title: string
  status: StatusView
  type: PostTypeView
  count: number
  commentCount: number
  voted: boolean
  /**
   * Публичная причина отказа, если обращение уже закрывали как
   * «не будем делать». Показывать её обязательно: лучший дубликат — тот,
   * который не создали (FR-643).
   */
  closedReason: string | null
}

export interface SimilarQuery {
  boardSlug: string
  typeKey: string
  title: string
}

/* ─────────────────────────── Роадмап ─────────────────────────── */

/** Карточка на роадмапе (FR-153): голоса, заголовок, доска-источник, ETA. */
export interface RoadmapCardView {
  slug: string
  boardSlug: string
  boardName: string
  title: string
  typeName: string
  categoryName: string | null
  count: number
  countLabel: [string, string, string]
  /** Ожидаемый срок, если команда его назвала: «II квартал», «релиз 2.31». */
  eta: string | null
}

export interface RoadmapColumnView {
  status: StatusView
  /** Всего в колонке — «Готово» бесконечная, поэтому нужен лимит (FR-155). */
  total: number
  items: RoadmapCardView[]
  /** Колонка раскрыта целиком. */
  expanded: boolean
}

export interface RoadmapView {
  columns: RoadmapColumnView[]
  boards: { slug: string; name: string }[]
}

/* ────────────────────────── Changelog ────────────────────────── */

export type ChangeKind = 'new' | 'improved' | 'fixed'

/**
 * Одно изменение внутри релиза.
 *
 * Запись — не один markdown-блок, а список изменений со своим типом у каждого:
 * иначе фильтр ленты по типу (FR-162) может отвечать только «в этом релизе
 * что-то исправляли», а не показывать что именно.
 */
export interface ChangelogChangeView {
  kind: ChangeKind
  title: string
  body: string
}

export interface ChangelogPostLink {
  slug: string
  boardSlug: string
  title: string
  status: StatusView
  count: number
  countLabel: [string, string, string]
}

export interface ChangelogEntryView {
  slug: string
  /** Версия релиза, если продукт их нумерует. */
  version: string | null
  title: string
  lead: string
  publishedAt: string
  publishedLabel: string
  /** Типы, встречающиеся в записи — для фильтра и бейджей в ленте. */
  kinds: ChangeKind[]
  labels: string[]
  changes: ChangelogChangeView[]
  /**
   * Обращения, закрытые этим релизом (FR-165). Здесь замыкается цикл:
   * их авторы и голосовавшие получают письмо «то, что вы просили, вышло».
   */
  closedPosts: ChangelogPostLink[]
}

export interface ChangelogQuery {
  kinds: ChangeKind[]
  labels: string[]
  cursor?: string | undefined
  limit?: number | undefined
}

export interface ChangelogResult {
  items: ChangelogEntryView[]
  nextCursor: string | null
  total: number
  kindFacets: FacetView[]
  labelFacets: FacetView[]
}

/** Контракт. Обе реализации обязаны экспортировать ровно это. */
export interface QueryPort {
  listBoards(): Promise<BoardView[]>
  getBoard(slug: string): Promise<BoardView | null>
  getFeed(query: FeedQuery): Promise<FeedResult>
  getPost(boardSlug: string, slug: string): Promise<PostPageResult | null>
  findSimilar(query: SimilarQuery): Promise<SimilarPostView[]>
  getRoadmap(boardSlug?: string, expandStatusKey?: string): Promise<RoadmapView>
  getChangelog(query: ChangelogQuery): Promise<ChangelogResult>
  getChangelogEntry(slug: string): Promise<ChangelogEntryView | null>
}
