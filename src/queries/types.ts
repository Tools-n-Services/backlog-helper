/**
 * КОНТРАКТ СЛОЯ ЗАПРОСОВ.
 *
 * Единственное, что UI знает о данных.
 *
 * Правило: view-model плоская и готовая к рендеру. Никаких ORM-объектов
 * и ленивых связей наружу: экран получает готовые к рендеру данные
 * и ничего не знает про Prisma (docs/08-dev-plan.md).
 */

import type { StatusShape } from '@config/statuses'
import type { Privacy } from '@config/post-types'

export interface StatusView {
  key: string
  name: string
  /**
   * Название на английском (FR-181). Оба сразу, а не одно по языку запроса:
   * слой запросов не знает, кто смотрит, — он и не должен, иначе его нельзя
   * будет позвать из воркера, где запроса нет вовсе.
   */
  nameEn?: string
  /** Форма маркера: состояние кодируется не только цветом. */
  shape: StatusShape
  isTerminal: boolean
}

export interface PostTypeView {
  key: string
  name: string
  nameEn?: string
  allowsVotes: boolean
  voteLabel: string
  voteLabelEn?: string
  /** Формы слова для счётчика: голоса у идей, затронутые у багов. */
  countLabel: [string, string, string]
  /** Английские формы (FR-181). Пусто — показываем основные. */
  countLabelEn?: [string, string, string]
}

export interface BoardView {
  slug: string
  name: string
  nameEn?: string
  description: string
  descriptionEn?: string
  visibility: 'public' | 'private' | 'readonly'
  postCount: number
  /** Категории доски целиком — форме нужны все, а не только непустые. */
  categories: { slug: string; name: string }[]
  /** Категория обязательна при создании обращения (FR-121). */
  requireCategory: boolean
}

/** Карточка обращения в ленте (FR-118). */
/**
 * Перевод текста на другой язык (FR-181).
 *
 * Отдаётся рядом с оригиналом, а не вместо него: пометка «переведено» без
 * возможности посмотреть исходный текст — это не перевод, а замена. Автор
 * писал конкретные слова, и читатель имеет право их увидеть.
 *
 * Тело абзацами — как и оригинал: в карточке ленты абзац один (выжимка),
 * на странице обращения их столько же, сколько в исходном тексте,
 * у комментария — один, целиком.
 */
export interface TranslationView {
  locale: string
  /** У комментария заголовка нет. */
  title: string | null
  body: string[]
}

export interface PostCardView {
  id: string
  slug: string
  boardSlug: string
  title: string
  excerpt: string
  /** Язык оригинала; null — не определяли (FR-181). */
  sourceLocale: string | null
  /** Готовые переводы. Пусто — перевода ещё нет или он не нужен. */
  translations: TranslationView[]
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
  /**
   * Обращение ждёт проверки модератором и в ленте не показывается (FR-201).
   * Собственному автору показывается — с этой пометкой: иначе он видит,
   * что его обращение исчезло, и пишет второе.
   */
  pendingModeration: boolean
  updatedAt: string
  /** Готовая подпись «3 дн. назад»: считается на сервере, чтобы не разъехалась гидратация. */
  updatedLabel: string
}

export type FeedSort = 'trending' | 'top' | 'new'

/** Значение фильтра со счётчиком — счётчики показываются в панели (FR-113). */
export interface FacetView {
  key: string
  name: string
  /** Название на английском (FR-181): статусы и типы приходят из конфига. */
  nameEn?: string
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
  /** Инициалы для аватара без фотографии. */
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
  /** Язык оригинала и готовые переводы (FR-181). */
  sourceLocale: string | null
  translations: TranslationView[]
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

/**
 * Вложение обращения (FR-512).
 *
 * Ссылка ведёт в приложение, а не в хранилище: право проверяется на каждом
 * запросе, и пересланная в чат ссылка на `team_only` у постороннего
 * не откроется.
 */
export interface AttachmentView {
  id: string
  name: string
  kindName: string
  sizeLabel: string
  /** Показывать картинкой, а не ссылкой: скриншот читается сразу. */
  isImage: boolean
  /** Видно только команде и репортеру (FR-561). */
  teamOnly: boolean
  url: string
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
  /** Вложения, которые смотрящему разрешено видеть (FR-512, FR-561). */
  attachments: AttachmentView[]
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
  /** Нужен, чтобы проголосовать прямо из врезки, не открывая обращение. */
  id: string
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
  /** Название типа и формы счётного слова по-английски (FR-181). */
  typeNameEn?: string
  categoryName: string | null
  count: number
  countLabel: [string, string, string]
  countLabelEn?: [string, string, string]
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
  boards: { slug: string; name: string; nameEn?: string }[]
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
  /** Английские формы счётного слова (FR-181). */
  countLabelEn?: [string, string, string]
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

/**
 * Запись changelog глазами команды (FR-165).
 *
 * Отдельный вид от публичного, потому что перед публикацией команду
 * интересует не список изменений, а последствия: какие обращения закроются
 * и сколько людей получит письмо. Публикация — единственное действие портала,
 * которое рассылает хорошие новости, и единственное, которое нельзя отозвать.
 */
/** Связанное обращение в редакторе: с идентификатором — его отвязывают. */
export interface ReleasePostLink extends ChangelogPostLink {
  id: string
}

export interface ReleaseAdminView {
  id: string
  slug: string
  title: string
  version: string | null
  /** null — ещё не опубликована. */
  publishedLabel: string | null
  /** Срок отложенной публикации, если задан (FR-166). */
  scheduledLabel: string | null
  changeCount: number
  /** Обращения, которые закроет публикация. */
  posts: ReleasePostLink[]
  /**
   * Верхняя оценка числа писем: по одному на живую подписку связанных
   * обращений. Настройки уведомлений часть из них отсекут.
   */
  letters: number
}

export interface ReleasesView {
  /** Черновики и запланированные — то, с чем работают. */
  pending: ReleaseAdminView[]
  /** Последние опубликованные: подтверждение, что цикл замкнулся. */
  published: ReleaseAdminView[]
}

/** Изменение внутри записи — с идентификатором: его правят и убирают. */
export interface ReleaseChangeView extends ChangelogChangeView {
  id: string
}

/**
 * Запись в редакторе.
 *
 * Отличается от публичного вида тем, что показывает незаполненное: черновик
 * без изменений, без вводки и без срока — рабочее состояние на полпути,
 * а не ошибка.
 */
export interface ReleaseDetailView extends ReleaseAdminView {
  lead: string
  labels: string[]
  changes: ReleaseChangeView[]
  /** Для поля ввода: `YYYY-MM-DDTHH:mm` в местном времени. */
  scheduledInput: string | null
  published: boolean
}

/* ─────────────────────────── Профиль ─────────────────────────── */

export interface ProfileView {
  /** Обращения, созданные пользователем. */
  authored: PostCardView[]
  /** За что он голосовал (FR-174). */
  voted: PostCardView[]
  stats: { authored: number; voted: number; inProgress: number }
}

/* ─────────────────────────── Бэклог ──────────────────────────── */

/**
 * Элемент бэклога — единица РАБОТЫ, а не обращение (06-backlog.md, раздел 0).
 *
 * Разделение центральное для продукта: одну работу питают несколько обращений,
 * внутренняя формулировка отличается от публичной, а техдолг конкурирует
 * за приоритет наравне, не имея ни одного обращения вовсе.
 */
export interface BacklogItemView {
  id: string
  title: string
  /** Формулировка проблемы, а не решения. */
  problem: string
  kind: string
  kindName: string
  themeName: string | null
  themeSlug: string | null
  /** Внутренний статус. Публичного соответствия может не быть. */
  statusKey: string | null
  statusName: string | null
  ownerName: string | null
  estimate: string | null
  targetRelease: string | null
  /** Сколько обращений питают эту работу. */
  postCount: number
  /** Суммарные голоса связанных обращений — грубая оценка спроса. */
  voteCount: number
  /**
   * Уникальные затронутые с весами сегментов (FR-612). Считается, а не
   * вводится: отличается от суммы голосов ровно на тех, кто голосовал
   * за несколько связанных обращений.
   */
  reach: number
  /** Сумма monthly_spend затронутых компаний (FR-613). */
  mrrSum: number | null
  /** Расчётный приоритет. null — нечем считать: нет оценок. */
  score: number | null
  updatedLabel: string
}

/** Связанное обращение в карточке элемента. */
export interface BacklogPostLink {
  id: string
  slug: string
  boardSlug: string
  boardName: string
  title: string
  status: StatusView
  count: number
  countLabel: [string, string, string]
}

/**
 * Цитата из источника вне портала (FR-621).
 *
 * Дословно, а не пересказом: на встрече о приоритете пересказ ничего
 * не доказывает, а фраза клиента — доказывает.
 */
export interface InsightView {
  id: string
  quote: string
  sourceName: string
  sourceUrl: string | null
  authorName: string | null
  companyName: string | null
  /** Деньги компании, из которой пришла цитата. */
  companyMrr: number | null
  createdLabel: string
}

/** Итог по цитатам: «12 цитат от 9 компаний, суммарно 18 000 ₽» (FR-623). */
export interface InsightSummary {
  quotes: number
  companies: number
  mrr: number | null
}

export interface BacklogItemDetailView extends BacklogItemView {
  /** Обращения, которые закроет эта работа (FR-602). */
  posts: BacklogPostLink[]
  /** Цитаты, привязанные к работе (FR-621). */
  insights: InsightView[]
  insightSummary: InsightSummary
  /** Компоненты формулы приоритета. Охват среди них не значится: он считается. */
  impact: number | null
  confidence: number | null
  effort: number | null
  /** Фазы: дочерние элементы (FR-608). */
  children: BacklogItemView[]
  parent: { id: string; title: string } | null
  /**
   * Публичная формулировка решения (FR-636). Уходит письмом голосовавшим,
   * когда работа выпущена или отклонена, поэтому пишется отдельно от
   * внутренней: «не будем, дорого» внутри и «решили сосредоточиться
   * на другом» наружу — не одно и то же.
   */
  decisionReasonPublic: string | null
}

/**
 * Работа, в которую попало обращение, — для страницы обращения.
 *
 * Внутренние формулировки наружу не идут: строку видит только команда,
 * и вопрос она закрывает ровно один — «этим кто-нибудь занимается?».
 */
export interface BacklogLinkView {
  id: string
  title: string
  kindName: string
  statusName: string | null
}

export interface BacklogColumnView {
  statusKey: string
  statusName: string
  hint: string
  items: BacklogItemView[]
}

/**
 * Порядок бэклога.
 *
 * `rank` — ручной, и он по умолчанию: расчётный приоритет остаётся подсказкой,
 * а решение принимают люди (FR-615). Сортировки по score и деньгам — способ
 * посмотреть на список другим взглядом, а не приговор.
 */
export type BacklogSort = 'rank' | 'score' | 'mrr'

export interface BacklogQuery {
  /** Ключ внутреннего статуса; пусто — все активные. */
  statusKeys: string[]
  themeSlugs: string[]
  kinds: string[]
  search: string
  /** Показывать завершённые: по умолчанию бэклог про предстоящее. */
  includeDone: boolean
  sort: BacklogSort
}

export interface BacklogView {
  items: BacklogItemView[]
  total: number
  themes: { slug: string; name: string; count: number }[]
  statuses: FacetView[]
  kinds: FacetView[]
}

/* ────────────────────────── Модерация ────────────────────────── */

/**
 * Обращение, ждущее проверки (FR-201).
 *
 * Показывается целиком, а не карточкой: решение принимается по тексту,
 * и заставлять модератора открывать каждое обращение отдельной страницей —
 * значит гарантировать, что очередь не разберут.
 */
export interface ModerationItemView {
  id: string
  ref: string
  slug: string
  boardSlug: string
  boardName: string
  title: string
  /** Тело обращения абзацами. */
  details: string[]
  typeName: string
  authorName: string
  authorEmail: string
  /** Сколько обращений автора уже одобрено: у новичка это ноль. */
  authorApprovedCount: number
  createdLabel: string
  ageDays: number
}

/* ──────────────────────────── Триаж ──────────────────────────── */

export type SlaState = 'answered' | 'ok' | 'soon' | 'overdue' | 'none'

/**
 * Строка очереди триажа (FR-531).
 *
 * Плоская и уже посчитанная: очередь читают по диагонали, и любое вычисление
 * в компоненте — это дрожание колонок при обновлении.
 */
export interface TriageRowView {
  id: string
  slug: string
  boardSlug: string
  ref: string
  title: string
  typeName: string
  typeKey: string
  status: StatusView
  /** Оценка репортера: «насколько мешает». Не приоритет команды. */
  severityKey: string | null
  severityShort: string | null
  /** Приоритет команды (FR-536). null — ещё не проставлен. */
  priorityKey: string | null
  /** Канал приёма: если 90% из одного, остальные не работают (FR-557). */
  sourceKey: string
  sourceName: string
  /** Уникальные затронутые — основной сигнал у багов (FR-524). */
  affectedCount: number
  /** Возраст обращения, готовая подпись. */
  ageLabel: string
  ageDays: number
  sla: { state: SlaState; label: string }
  assigneeName: string | null
  assigneeInitials: string | null
  /** Повтор ранее исправленного бага — поднимается в очереди (FR-525). */
  regression: boolean
  /** Автооценка приоритета: подсказка для сортировки, не решение. */
  autoPriority: number
}

export type TriageSort = 'auto' | 'sla' | 'new'

export interface TriageQuery {
  sort: TriageSort
  /** Только просроченные по SLA. */
  overdueOnly: boolean
  severityKeys: string[]
  typeKeys: string[]
  /** Только назначенные на этого пользователя (FR-537). */
  assigneeId?: string | undefined
  search: string
}

export interface TriageQueueView {
  rows: TriageRowView[]
  total: number
  /** Метрики очереди: без них процесс незаметно деградирует (05-bug-intake §3.2). */
  metrics: {
    untriaged: number
    overdue: number
    oldestUntriagedDays: number
    awaitingReporter: number
  }
  facets: { severities: FacetView[]; types: FacetView[] }
}

/**
 * Контракт. Обе реализации обязаны экспортировать ровно это.
 *
 * `userId` необязателен везде, где ответ зависит от того, кто смотрит:
 * «я уже голосовал» и «я подписан» — свойства пары (обращение, человек),
 * а не обращения. Без него метод отвечает как гостю.
 */
export interface QueryPort {
  listBoards(): Promise<BoardView[]>
  getBoard(slug: string): Promise<BoardView | null>
  getFeed(query: FeedQuery, userId?: string): Promise<FeedResult>
  getPost(boardSlug: string, slug: string, userId?: string): Promise<PostPageResult | null>
  findSimilar(query: SimilarQuery, userId?: string): Promise<SimilarPostView[]>
  getRoadmap(boardSlug?: string, expandStatusKey?: string): Promise<RoadmapView>
  getChangelog(query: ChangelogQuery): Promise<ChangelogResult>
  getChangelogEntry(slug: string): Promise<ChangelogEntryView | null>
  getProfile(userId: string): Promise<ProfileView>
  getTriageQueue(query: TriageQuery): Promise<TriageQueueView>
  /** Обращения, ждущие проверки модератором (FR-201). */
  getModerationQueue(): Promise<ModerationItemView[]>
  /** Бэклог: единицы работы, а не обращения (FR-601). */
  getBacklog(query: BacklogQuery): Promise<BacklogView>
  getBacklogItem(id: string): Promise<BacklogItemDetailView | null>
  /** В какие работы попало обращение. Видно только команде. */
  getBacklogLinksForPost(postId: string): Promise<BacklogLinkView[]>
  /**
   * Все вложения обращения, включая `team_only` (FR-561).
   *
   * Отдельным методом, а не флагом в `getPost`: право проверяет экран,
   * который знает, кто смотрит, — так же, как со связью с бэклогом.
   * В самой странице обращения лежит только то, что видно смотрящему
   * без прав команды.
   */
  getPostAttachments(postId: string): Promise<AttachmentView[]>
  /** Релизы глазами команды: что закроет публикация (FR-165). */
  getReleases(): Promise<ReleasesView>
  /** Запись в редакторе: поля, изменения и привязанные обращения. */
  getRelease(id: string): Promise<ReleaseDetailView | null>
}
