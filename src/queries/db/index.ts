/**
 * Реализация контракта запросов на Postgres.
 *
 * Наружу отдаются только готовые к рендеру view-model: ни одного ORM-объекта
 * и ни одной ленивой связи. Экраны о существовании Prisma не знают.
 *
 * Разделение ответственности, которое здесь соблюдается буквально:
 * база отвечает на вопрос «в каком статусе обращение», конфигурация —
 * «как этот статус выглядит». Поэтому `status.shape`, `type.countLabel`
 * и прочее оформление берутся из `config/`, а не из колонок: форма маркера
 * и склонение слова «голос» — не данные предметной области, и хранить их
 * в базе значит требовать миграцию ради смены подписи.
 */

import { product } from '@config/product'
import { statuses, statusByKey } from '@config/statuses'
import { postTypes, postTypeByKey } from '@config/post-types'
import { backlogKinds, backlogKindName, internalStatuses, internalStatusByKey } from '@config/internal-statuses'
import { severities } from '@config/scoring'
import type { Privacy } from '@config/post-types'
import type { BacklogKind } from '@/generated/prisma/enums'
import { prisma } from '@/core/db'
import { autoPriority } from '@/core/domain/triage/priority'
import { slaState } from '@/core/domain/triage/sla'
import {
  isSearchable,
  SEARCH_TRIGRAM_THRESHOLD,
  SIMILARITY_THRESHOLD,
} from '@/core/domain/intake/similar'
import { excerptOf, relativeLabel } from '@/core/format'
import type {
  BoardView,
  ChangeKind,
  ChangelogEntryView,
  ChangelogQuery,
  ChangelogResult,
  CommentView,
  FacetView,
  FeedQuery,
  BacklogItemDetailView,
  BacklogItemView,
  BacklogLinkView,
  BacklogQuery,
  BacklogView,
  FeedResult,
  ModerationItemView,
  PersonView,
  PostCardView,
  PostPageResult,
  PostTypeView,
  ProfileView,
  QueryPort,
  ReleaseAdminView,
  ReleasesView,
  RoadmapView,
  SimilarPostView,
  SimilarQuery,
  StatusChangeView,
  StatusView,
  TriageQuery,
  TriageQueueView,
  TriageRowView,
} from '@/queries/types'

/* ────────────────────── Оформление из конфигурации ────────────────────── */

function toStatusView(key: string): StatusView {
  const s = statusByKey.get(key)
  if (!s) throw new Error(`Статус ${key} есть в базе, но не описан в config/statuses.ts`)
  return { key: s.key, name: s.name, shape: s.shape, isTerminal: s.isTerminal }
}

function toTypeView(key: string): PostTypeView {
  const t = postTypeByKey.get(key)
  if (!t) throw new Error(`Тип ${key} есть в базе, но не описан в config/post-types.ts`)
  return {
    key: t.key,
    name: t.name,
    allowsVotes: t.allowsVotes,
    voteLabel: t.voteLabel,
    countLabel: t.countLabel,
  }
}

function countLabelOf(key: string): [string, string, string] {
  return postTypeByKey.get(key)?.countLabel ?? ['голос', 'голоса', 'голосов']
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function toPerson(user: {
  name: string
  role: string
  isTeam: boolean
} | null): PersonView {
  if (!user) {
    /* Автор анонимизирован (FR-175): обращение остаётся, имя уходит. */
    return { name: 'Удалённый аккаунт', initials: '—', role: '', isTeam: false }
  }
  return {
    name: user.name,
    initials: initials(user.name),
    role: user.role,
    isTeam: user.isTeam,
  }
}

/* ─────────────────────────── Общие условия ────────────────────────────── */

/**
 * Всё, что вообще может попасть в публичную выдачу.
 *
 * Условие вынесено в одну функцию намеренно: забыть `mergedIntoId: null`
 * в одном месте достаточно, чтобы дубликаты полезли в ленту
 * (02-data-model.md, «Следствия для чтения»).
 */
function publiclyListed() {
  return {
    mergedIntoId: null,
    moderation: 'approved' as const,
    type: { publicFeed: true },
  }
}

const listedTypeKeys = postTypes.filter((t) => t.publicFeed).map((t) => t.key)

function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8')
}

/** Порядок ленты. Закреплённые всегда сверху (FR-216). */
function feedOrder(sort: FeedQuery['sort']) {
  const primary =
    sort === 'top'
      ? { voteCount: 'desc' as const }
      : sort === 'new'
        ? { createdAt: 'desc' as const }
        : { trendScore: 'desc' as const }
  /* id последним — детерминированный доводчик: без него две записи с равным
     счётом меняются местами между страницами, и курсор даёт дубли. */
  return [{ pinned: 'desc' as const }, primary, { id: 'asc' as const }]
}

/**
 * Идентификаторы обращений, попадающих под поисковый запрос (FR-115).
 *
 * Поиск гибридный: полнотекстовый по `search_tsv` ИЛИ триграммный по заголовку.
 * Оба индекса для этого уже есть, и нужны оба.
 *
 * Полнотекстовый умеет морфологию — «копирование недель» находит «копирование
 * недели». Но русский snowball-стеммер неполон: «переработка» приводится
 * к основе «переработк», а «переработок» остаётся собой, и обращение
 * «Учёт переработок» по запросу «переработка» не находится вовсе.
 * Триграммы этого разрыва не знают: они сравнивают написание, а не грамматику,
 * и заодно прощают опечатку.
 *
 * `websearch_to_tsquery` разбирает то, что человек реально набирает: кавычки
 * для точной фразы, `-` для исключения. И, в отличие от `to_tsquery`,
 * не падает на произвольном вводе — лента обязана пережить любую строку,
 * включая случайно вставленную из буфера.
 *
 * null означает «поиска нет».
 */
async function searchMatches(search: string): Promise<string[] | null> {
  const query = search.trim()
  if (!query) return null

  /* Порог триграмм задаётся на транзакцию, а не глобально в базе: это
     решение продукта, оно должно быть видно рядом с запросом и не влиять
     на остальные соединения. Оператор `<%` читает именно эту настройку,
     поэтому индекс продолжает работать. */
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL pg_trgm.word_similarity_threshold = ${SEARCH_TRIGRAM_THRESHOLD}`,
    )
    return tx.$queryRaw<{ id: string }[]>`
      SELECT p."id"
      FROM "post" p
      WHERE p."search_tsv" @@ websearch_to_tsquery('portal_search', ${query})
         OR ${query} <% p."title"
      ORDER BY
        /* Совпадение по смыслу важнее совпадения по написанию: точное
           вхождение слова должно стоять выше похожего на него. */
        ts_rank(p."search_tsv", websearch_to_tsquery('portal_search', ${query})) DESC,
        word_similarity(${query}, p."title") DESC
      LIMIT 500
    `
  })
  return rows.map((r) => r.id)
}

/** Полный набор фильтров ленты, кроме одного — для счётчиков панели. */
function feedWhere(
  query: FeedQuery,
  matches: string[] | null,
  skip?: 'status' | 'type' | 'category',
) {
  return {
    board: { slug: query.boardSlug },
    ...publiclyListed(),
    /* Пустой список — не «фильтра нет», а «не нашлось ничего»: без этого
       поиск без результатов показывал бы всю ленту. */
    ...(matches !== null ? { id: { in: matches } } : {}),
    ...(skip !== 'status' && query.statusKeys.length
      ? { status: { key: { in: query.statusKeys } } }
      : {}),
    ...(skip !== 'type' && query.typeKeys.length
      ? { type: { key: { in: query.typeKeys } } }
      : {}),
    ...(skip !== 'category' && query.categorySlugs.length
      ? { category: { slug: { in: query.categorySlugs } } }
      : {}),
  }
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  details: true,
  moderation: true,
  voteCount: true,
  commentCount: true,
  pinned: true,
  privacy: true,
  firstResponseAt: true,
  needsInfoSince: true,
  updatedAt: true,
  createdAt: true,
  board: { select: { slug: true } },
  status: { select: { key: true } },
  type: { select: { key: true } },
  category: { select: { slug: true, name: true } },
} as const

type CardRow = {
  id: string
  slug: string
  title: string
  details: string
  moderation: string
  voteCount: number
  commentCount: number
  pinned: boolean
  privacy: string
  firstResponseAt: Date | null
  needsInfoSince: Date | null
  updatedAt: Date | null
  createdAt: Date
  board: { slug: string }
  status: { key: string }
  type: { key: string }
  category: { slug: string; name: string } | null
}

function toCardView(row: CardRow, now: Date, votedIds: Set<string>): PostCardView {
  const updatedAt = row.updatedAt ?? row.createdAt
  return {
    id: row.id,
    slug: row.slug,
    boardSlug: row.board.slug,
    title: row.title,
    excerpt: excerptOf(row.details),
    type: toTypeView(row.type.key),
    status: toStatusView(row.status.key),
    categoryName: row.category?.name ?? null,
    categorySlug: row.category?.slug ?? null,
    count: row.voteCount,
    commentCount: row.commentCount,
    pinned: row.pinned,
    privacy: row.privacy as Privacy,
    /* «Команда ответила» — это не отдельный флаг, а факт первого ответа:
       та же колонка, по которой считается SLA. */
    hasTeamReply: row.firstResponseAt !== null,
    awaitingReporter: row.needsInfoSince !== null,
    voted: votedIds.has(row.id),
    pendingModeration: row.moderation === 'pending',
    updatedAt: updatedAt.toISOString(),
    updatedLabel: relativeLabel(updatedAt, now),
  }
}

/**
 * За какие из показанных обращений текущий пользователь уже голосовал.
 *
 * Одним запросом на страницу, а не по запросу на карточку: тридцать карточек
 * дали бы тридцать обращений к базе на каждый рендер ленты.
 */
async function votedAmong(postIds: string[], userId?: string): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set()
  const rows = await prisma.vote.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true },
  })
  return new Set(rows.map((r) => r.postId))
}

/* ──────────────────────────── Реализация ──────────────────────────────── */

export const dbQueries: QueryPort = {
  async listBoards(): Promise<BoardView[]> {
    const rows = await prisma.board.findMany({
      orderBy: { position: 'asc' },
      select: {
        slug: true,
        name: true,
        description: true,
        visibility: true,
        postCount: true,
        requireCategory: true,
        categories: {
          orderBy: { position: 'asc' },
          select: { slug: true, name: true },
        },
      },
    })

    return rows.map((b) => ({
      slug: b.slug,
      name: b.name,
      description: b.description,
      visibility: b.visibility,
      /* Денормализованный счётчик, который ведёт триггер: пересчитывать
         его запросом на каждый рендер навигации — верный способ получить
         seq scan по всем обращениям. */
      postCount: b.postCount,
      categories: b.categories,
      requireCategory: b.requireCategory,
    }))
  },

  async getBoard(slug: string): Promise<BoardView | null> {
    const all = await dbQueries.listBoards()
    return all.find((b) => b.slug === slug) ?? null
  },

  async getFeed(query: FeedQuery, userId?: string): Promise<FeedResult> {
    const now = new Date()
    const limit = query.limit ?? product.limits.feedPageSize
    const matches = await searchMatches(query.search)
    const where = feedWhere(query, matches)

    const [rows, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: feedOrder(query.sort),
        take: limit + 1,
        ...(query.cursor
          ? { cursor: { id: decodeCursor(query.cursor) }, skip: 1 }
          : {}),
        select: cardSelect,
      }),
      prisma.post.count({ where }),
    ])

    /* Берём на одну запись больше запрошенного: наличие «лишней» и есть
       ответ на вопрос, показывать ли «Показать ещё». Отдельный count
       для этого не нужен. */
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const voted = await votedAmong(page.map((r) => r.id), userId)

    return {
      items: page.map((r) => toCardView(r, now, voted)),
      nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
      total,
      facets: await facetsFor(query, matches),
    }
  },

  async getPost(
    boardSlug: string,
    slug: string,
    userId?: string,
  ): Promise<PostPageResult | null> {
    const row = await prisma.post.findFirst({
      where: { board: { slug: boardSlug }, slug },
      select: {
        ...cardSelect,
        ref: true,
        eta: true,
        author: { select: { name: true, role: true, isTeam: true } },
        mergedInto: {
          select: { slug: true, title: true, board: { select: { slug: true } } },
        },
        mergedFrom: {
          select: { title: true, slug: true, ref: true, voteCount: true },
          orderBy: { createdAt: 'asc' },
        },
        statusChanges: {
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            toStatus: { select: { key: true } },
            changedBy: { select: { name: true } },
          },
        },
        votes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { user: { select: { name: true, role: true, isTeam: true } } },
        },
        comments: {
          where: { deletedAt: null, internal: false },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            body: true,
            likeCount: true,
            pinned: true,
            createdAt: true,
            parentId: true,
            author: { select: { name: true, role: true, isTeam: true } },
          },
        },
        subscriptions: userId
          ? { where: { userId, unsubscribedAt: null }, select: { id: true } }
          : false,
      },
    })

    if (!row) return null

    /* Смерженное обращение не открывается молча: пользователю показывается,
       куда и почему его перенесли, а старая ссылка из письма продолжает
       работать (FR-141). */
    if (row.mergedInto) {
      return {
        kind: 'merged',
        title: row.title,
        target: {
          boardSlug: row.mergedInto.board.slug,
          slug: row.mergedInto.slug,
          title: row.mergedInto.title,
        },
      }
    }

    const now = new Date()
    const voted = await votedAmong([row.id], userId)

    /* Тред собирается в памяти: комментариев на обращение единицы и десятки,
       и рекурсивный запрос ради одного уровня вложенности не нужен. */
    const byParent = new Map<string, typeof row.comments>()
    for (const c of row.comments) {
      if (!c.parentId) continue
      const list = byParent.get(c.parentId) ?? []
      list.push(c)
      byParent.set(c.parentId, list)
    }

    const toComment = (c: (typeof row.comments)[number]): CommentView => ({
      id: c.id,
      author: toPerson(c.author),
      createdAt: c.createdAt.toISOString(),
      createdLabel: relativeLabel(c.createdAt, now),
      body: c.body,
      likeCount: c.likeCount,
      pinned: c.pinned,
      replies: (byParent.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(toComment),
    })

    const topLevel = row.comments
      .filter((c) => !c.parentId)
      /* Закреплённый ответ команды — первым в треде (FR-138). */
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      .map(toComment)

    const statusHistory: StatusChangeView[] = row.statusChanges.map((change) => ({
      status: toStatusView(change.toStatus.key),
      label: relativeLabel(change.createdAt, now),
      byName: change.changedBy?.name ?? null,
    }))

    return {
      kind: 'post',
      ...toCardView(row, now, voted),
      ref: row.ref,
      details: row.details.split(/\n{2,}/).filter(Boolean),
      author: toPerson(row.author),
      createdAt: row.createdAt.toISOString(),
      createdLabel: relativeLabel(row.createdAt, now),
      eta: row.eta,
      statusHistory,
      voters: row.votes.map((v) => toPerson(v.user)),
      votersTotal: row.voteCount,
      votersHidden: !product.features.voterList,
      merged: row.mergedFrom.map((m) => ({
        title: m.title,
        slug: m.slug,
        ref: m.ref,
        /* Сколько голосов переехало при слиянии. */
        movedVotes: m.voteCount,
      })),
      comments: topLevel,
      subscribed: Array.isArray(row.subscriptions) && row.subscriptions.length > 0,
    }
  },

  /**
   * Похожие обращения при вводе заголовка (FR-122).
   *
   * `word_similarity` из pg_trgm, а не полнотекстовый поиск: человек набрал
   * треть заголовка и, скорее всего, с опечаткой — здесь нужны частичные
   * совпадения, а не морфология. Порог задан в домене и общий с проверкой
   * на вводе, чтобы врезка не спорила сама с собой.
   */
  async findSimilar(query: SimilarQuery, userId?: string): Promise<SimilarPostView[]> {
    if (!isSearchable(query.title)) return []

    const rows = await prisma.$queryRaw<
      {
        id: string
        slug: string
        board_slug: string
        title: string
        status_key: string
        type_key: string
        vote_count: number
        comment_count: number
        resolution_reason_public: string | null
        status_is_terminal: boolean
      }[]
    >`
      SELECT p."id", p."slug", b."slug" AS board_slug, p."title",
             s."key" AS status_key, t."key" AS type_key,
             p."vote_count", p."comment_count",
             p."resolution_reason_public", s."is_terminal" AS status_is_terminal
      FROM "post" p
      JOIN "board" b ON b."id" = p."board_id"
      JOIN "status" s ON s."id" = p."status_id"
      JOIN "post_type" t ON t."id" = p."type_id"
      WHERE b."slug" = ${query.boardSlug}
        AND p."merged_into_id" IS NULL
        AND p."moderation" = 'approved'
        AND t."public_feed"
        AND word_similarity(${query.title}, p."title") >= ${SIMILARITY_THRESHOLD}
      ORDER BY word_similarity(${query.title}, p."title") DESC, p."vote_count" DESC
      LIMIT 4
    `

    const voted = await votedAmong(rows.map((r) => r.id), userId)

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      boardSlug: r.board_slug,
      title: r.title,
      status: toStatusView(r.status_key),
      type: toTypeView(r.type_key),
      count: Number(r.vote_count),
      commentCount: Number(r.comment_count),
      voted: voted.has(r.id),
      /* Публичная причина отказа показывается обязательно: лучший дубликат —
         тот, который не создали (FR-643). */
      closedReason: r.status_is_terminal ? r.resolution_reason_public : null,
    }))
  },

  async getRoadmap(boardSlug?: string, expandStatusKey?: string): Promise<RoadmapView> {
    const roadmapStatuses = statuses
      .filter((s) => s.showOnRoadmap)
      .sort((a, b) => a.position - b.position)

    const columns = await Promise.all(
      roadmapStatuses.map(async (status) => {
        const where = {
          ...publiclyListed(),
          status: { key: status.key },
          /* Роадмап агрегирует обращения со ВСЕХ досок (FR-151): пользователю
             неинтересно, в какой из них лежит запрос. */
          ...(boardSlug ? { board: { slug: boardSlug } } : {}),
        }
        const expanded = status.key === expandStatusKey
        const [items, total] = await Promise.all([
          prisma.post.findMany({
            where,
            /* Внутри колонки — по голосам: наверху то, чего ждут сильнее всего. */
            orderBy: [{ voteCount: 'desc' }, { id: 'asc' }],
            ...(expanded ? {} : { take: ROADMAP_COLUMN_LIMIT }),
            select: {
              slug: true,
              title: true,
              voteCount: true,
              eta: true,
              board: { select: { slug: true, name: true } },
              type: { select: { key: true } },
              category: { select: { name: true } },
            },
          }),
          prisma.post.count({ where }),
        ])

        return {
          status: toStatusView(status.key),
          total,
          expanded,
          items: items.map((p) => ({
            slug: p.slug,
            boardSlug: p.board.slug,
            boardName: p.board.name,
            title: p.title,
            typeName: postTypeByKey.get(p.type.key)?.name ?? p.type.key,
            categoryName: p.category?.name ?? null,
            count: p.voteCount,
            countLabel: countLabelOf(p.type.key),
            eta: p.eta,
          })),
        }
      }),
    )

    const boards = await prisma.board.findMany({
      where: { visibility: 'public' },
      orderBy: { position: 'asc' },
      select: { slug: true, name: true },
    })

    return { columns, boards }
  },

  async getChangelog(query: ChangelogQuery): Promise<ChangelogResult> {
    const limit = query.limit ?? 3
    const where = {
      publishedAt: { not: null },
      ...(query.kinds.length ? { types: { hasSome: query.kinds } } : {}),
      ...(query.labels.length ? { labels: { hasSome: query.labels } } : {}),
    }

    const [rows, total, all] = await Promise.all([
      prisma.changelogEntry.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: decodeCursor(query.cursor) }, skip: 1 } : {}),
        select: entrySelect,
      }),
      prisma.changelogEntry.count({ where }),
      /* Счётчики фильтров считаются по всем опубликованным записям, а не по
         текущей выборке: иначе выбор одного типа обнуляет остальные. */
      prisma.changelogEntry.findMany({
        where: { publishedAt: { not: null } },
        select: { types: true, labels: true },
      }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const countBy = (pick: (e: { types: string[]; labels: string[] }) => string[]) => {
      const map = new Map<string, number>()
      for (const entry of all) {
        for (const value of new Set(pick(entry))) {
          map.set(value, (map.get(value) ?? 0) + 1)
        }
      }
      return map
    }

    const kindCounts = countBy((e) => e.types)
    const labelCounts = countBy((e) => e.labels)

    return {
      items: await Promise.all(page.map((e) => toEntryView(e))),
      nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
      total,
      kindFacets: (Object.keys(CHANGE_KIND_NAMES) as ChangeKind[])
        .map((kind) => ({
          key: kind,
          name: CHANGE_KIND_NAMES[kind],
          count: kindCounts.get(kind) ?? 0,
        }))
        .filter((f) => f.count > 0),
      labelFacets: [...labelCounts.entries()]
        .map(([label, count]) => ({ key: label, name: label, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }
  },

  async getChangelogEntry(slug: string): Promise<ChangelogEntryView | null> {
    const row = await prisma.changelogEntry.findUnique({
      where: { slug },
      select: entrySelect,
    })
    /* Неопубликованная запись наружу не отдаётся даже по прямой ссылке:
       черновик релиза — это анонс до срока, а `slug` у записи предсказуем
       по версии продукта (FR-166). */
    return row?.publishedAt ? toEntryView(row) : null
  },

  /**
   * Релизы глазами команды (FR-165).
   *
   * Черновики и запланированные впереди: это то, с чем работают. К каждой
   * записи — список обращений, которые публикация закроет, и оценка числа
   * писем. Публикацию нельзя отозвать, поэтому её последствия видны до нажатия,
   * а не после.
   */
  async getReleases(): Promise<ReleasesView> {
    const [pending, published] = await Promise.all([
      prisma.changelogEntry.findMany({
        where: { publishedAt: null },
        /* Со сроком — впереди и в порядке срока: у них дата уже обещана. */
        orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: releaseSelect,
      }),
      prisma.changelogEntry.findMany({
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: releaseSelect,
      }),
    ])

    const postIds = [...pending, ...published].flatMap((r) => r.posts.map((p) => p.post.id))
    /* Одним запросом на всё, а не по записи: живых подписок у обращения
       десятки, и N+1 здесь читался бы как «экран релизов медленный». */
    const subscriptions = postIds.length
      ? await prisma.subscription.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, unsubscribedAt: null },
          _count: { _all: true },
        })
      : []
    const byPost = new Map(subscriptions.map((s) => [s.postId, s._count._all]))

    return {
      pending: pending.map((r) => toReleaseView(r, byPost)),
      published: published.map((r) => toReleaseView(r, byPost)),
    }
  },

  /**
   * Профиль: что человек создал и за что голосовал (FR-174).
   *
   * Связи настоящие: `author_id` и таблица `vote`. Свои обращения человек
   * видит и на модерации — см. условие ниже.
   */
  async getProfile(userId: string): Promise<ProfileView> {
    const empty = { authored: [], voted: [], stats: { authored: 0, voted: 0, inProgress: 0 } }
    if (!isUuid(userId)) return empty

    const now = new Date()
    const [authored, votedPosts] = await Promise.all([
      prisma.post.findMany({
        /* Свои обращения человек видит и на проверке: иначе отправленное
           обращение просто исчезает, и он пишет его второй раз.
           Условие модерации здесь снято намеренно — в отличие от ленты. */
        where: {
          authorId: userId,
          mergedIntoId: null,
          type: { publicFeed: true },
          moderation: { in: ['approved', 'pending'] },
        },
        orderBy: { createdAt: 'desc' },
        select: cardSelect,
      }),
      prisma.post.findMany({
        where: { votes: { some: { userId } }, ...publiclyListed() },
        orderBy: { updatedAt: 'desc' },
        select: cardSelect,
      }),
    ])

    const votedIds = new Set(votedPosts.map((p) => p.id))
    const authoredViews = authored.map((p) => toCardView(p, now, votedIds))
    const votedViews = votedPosts.map((p) => toCardView(p, now, votedIds))

    return {
      authored: authoredViews,
      voted: votedViews,
      stats: {
        authored: authoredViews.length,
        voted: votedViews.length,
        inProgress: [...authoredViews, ...votedViews].filter(
          (p) => p.status.key === 'building' || p.status.key === 'planned',
        ).length,
      },
    }
  },

  /**
   * Очередь модерации (FR-201).
   *
   * Обращения от новых авторов не попадают в ленту до проверки — и без этого
   * экрана они не попадали бы туда никогда. Порядок от старых к новым:
   * дольше всех ждёт тот, кто написал первым, и он же первым решит,
   * что портал не работает.
   */
  async getModerationQueue(): Promise<ModerationItemView[]> {
    const now = new Date()
    const rows = await prisma.post.findMany({
      where: { moderation: 'pending', mergedIntoId: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        ref: true,
        slug: true,
        title: true,
        details: true,
        createdAt: true,
        board: { select: { slug: true, name: true } },
        type: { select: { key: true } },
        author: {
          select: {
            name: true,
            email: true,
            /* Сколько у автора уже принятых обращений: ноль означает,
               что это первое, и смотреть его нужно внимательнее. */
            _count: { select: { posts: { where: { moderation: 'approved' } } } },
          },
        },
      },
    })

    return rows.map((row) => ({
      id: row.id,
      ref: row.ref,
      slug: row.slug,
      boardSlug: row.board.slug,
      boardName: row.board.name,
      title: row.title,
      details: row.details.split(/\n{2,}/).filter(Boolean),
      typeName: postTypeByKey.get(row.type.key)?.name ?? row.type.key,
      authorName: row.author?.name ?? 'Удалённый аккаунт',
      authorEmail: row.author?.email ?? '',
      authorApprovedCount: row.author?._count.posts ?? 0,
      createdLabel: relativeLabel(row.createdAt, now),
      ageDays: (now.getTime() - row.createdAt.getTime()) / MS_PER_DAY,
    }))
  },

/* ─────────────────────────── Бэклог ──────────────────────────── */

  /**
   * Список работ (FR-601, FR-616).
   *
   * Порядок — ручной ранг, а не расчётный скор: продуктовые решения принимают
   * люди, и расчёт остаётся подсказкой (FR-615). Завершённое по умолчанию
   * скрыто — бэклог отвечает на вопрос «что дальше», а не «что было».
   */
  async getBacklog(query: BacklogQuery): Promise<BacklogView> {
    const now = new Date()
    const search = query.search.trim()

    const where = {
      ...(query.includeDone ? {} : { internalStatus: { isTerminal: false } }),
      ...(query.statusKeys.length
        ? { internalStatus: { key: { in: query.statusKeys } } }
        : {}),
      ...(query.themeSlugs.length ? { theme: { slug: { in: query.themeSlugs } } } : {}),
      ...(query.kinds.length ? { kind: { in: query.kinds as BacklogKind[] } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { problem: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [rows, total, themes, allItems] = await Promise.all([
      prisma.backlogItem.findMany({ where, orderBy: { rank: 'asc' }, select: backlogSelect }),
      prisma.backlogItem.count({ where }),
      prisma.theme.findMany({
        orderBy: { name: 'asc' },
        select: { slug: true, name: true, _count: { select: { items: true } } },
      }),
      /* Счётчики фильтров — по всем активным работам, а не по текущей выборке:
         иначе выбор статуса обнуляет остальные и панель бесполезна. */
      prisma.backlogItem.findMany({
        where: query.includeDone ? {} : { internalStatus: { isTerminal: false } },
        select: { kind: true, internalStatus: { select: { key: true } } },
      }),
    ])

    const countBy = <T>(pick: (i: (typeof allItems)[number]) => T | null) => {
      const map = new Map<T, number>()
      for (const item of allItems) {
        const key = pick(item)
        if (key !== null) map.set(key, (map.get(key) ?? 0) + 1)
      }
      return map
    }
    const statusCounts = countBy((i) => i.internalStatus?.key ?? null)
    const kindCounts = countBy((i) => i.kind)

    return {
      items: rows.map((r) => toBacklogItemView(r, now)),
      total,
      themes: themes.map((t) => ({ slug: t.slug, name: t.name, count: t._count.items })),
      statuses: internalStatuses
        .map((s) => ({ key: s.key, name: s.name, count: statusCounts.get(s.key) ?? 0 }))
        .filter((f) => f.count > 0),
      kinds: backlogKinds
        .map((k) => ({ key: k.key, name: k.name, count: kindCounts.get(k.key) ?? 0 }))
        .filter((f) => f.count > 0),
    }
  },

  async getBacklogItem(id: string): Promise<BacklogItemDetailView | null> {
    if (!isUuid(id)) return null

    const row = await prisma.backlogItem.findUnique({
      where: { id },
      select: {
        ...backlogSelect,
        decisionReasonPublic: true,
        parent: { select: { id: true, title: true } },
        children: { orderBy: { rank: 'asc' }, select: backlogSelect },
        posts: {
          select: {
            post: {
              select: {
                id: true,
                slug: true,
                title: true,
                voteCount: true,
                board: { select: { slug: true, name: true } },
                status: { select: { key: true } },
                type: { select: { key: true } },
              },
            },
          },
        },
      },
    })
    if (!row) return null

    const now = new Date()
    return {
      ...toBacklogItemView(row, now),
      parent: row.parent,
      decisionReasonPublic: row.decisionReasonPublic,
      children: row.children.map((c) => toBacklogItemView(c, now)),
      posts: row.posts
        .map(({ post }) => ({
          id: post.id,
          slug: post.slug,
          boardSlug: post.board.slug,
          boardName: post.board.name,
          title: post.title,
          status: toStatusView(post.status.key),
          count: post.voteCount,
          countLabel: countLabelOf(post.type.key),
        }))
        /* Самое востребованное сверху: по нему и решают, браться ли. */
        .sort((a, b) => b.count - a.count),
    }
  },

  async getBacklogLinksForPost(postId: string): Promise<BacklogLinkView[]> {
    if (!isUuid(postId)) return []

    const rows = await prisma.backlogPost.findMany({
      where: { postId },
      select: {
        backlogItem: {
          select: {
            id: true,
            title: true,
            kind: true,
            internalStatus: { select: { name: true } },
          },
        },
      },
    })

    return rows.map(({ backlogItem }) => ({
      id: backlogItem.id,
      title: backlogItem.title,
      kindName: backlogKindName(backlogItem.kind),
      statusName: backlogItem.internalStatus?.name ?? null,
    }))
  },

  async getTriageQueue(query: TriageQuery): Promise<TriageQueueView> {
    const now = new Date()

    /* В очередь попадает всё незакрытое, включая вопросы: они тоже требуют
       ответа, просто не идут в бэклог (FR-507). */
    const openOnly = { mergedIntoId: null, status: { isTerminal: false } }

    const rows = await prisma.post.findMany({
      where: openOnly,
      select: {
        id: true,
        slug: true,
        ref: true,
        title: true,
        voteCount: true,
        severity: true,
        frequency: true,
        priority: true,
        createdAt: true,
        firstResponseAt: true,
        slaDueAt: true,
        needsInfoSince: true,
        regressionOf: true,
        board: { select: { slug: true } },
        status: { select: { key: true } },
        type: { select: { key: true } },
        source: { select: { key: true, name: true } },
        assignee: { select: { id: true, name: true, segments: true } },
        author: { select: { segments: true } },
      },
    })

    const all = rows.map((row) => toTriageRow(row, now))

    const matched = all.filter((row) => {
      if (query.overdueOnly && row.sla.state !== 'overdue') return false
      if (query.severityKeys.length && !query.severityKeys.includes(row.severityKey ?? ''))
        return false
      if (query.typeKeys.length && !query.typeKeys.includes(row.typeKey)) return false
      if (query.search && !row.title.toLowerCase().includes(query.search.toLowerCase()))
        return false
      if (query.assigneeId && row.assigneeId !== query.assigneeId) return false
      return true
    })

    const sorted = matched.slice().sort((a, b) => {
      /* Отвеченное уходит вниз в любой сортировке: очередь — про то, что ждёт
         действия, а не про то, что уже разобрано. */
      const answered = (r: TriageRowView) => r.sla.state === 'answered'
      if (answered(a) !== answered(b)) return answered(a) ? 1 : -1

      /* Среди требующих действия регрессии идут первыми: повтор ранее
         исправленного — сигнал о сбое процесса (FR-525). */
      if (a.regression !== b.regression) return a.regression ? -1 : 1

      switch (query.sort) {
        case 'sla':
          return a.sla.state === b.sla.state
            ? b.autoPriority - a.autoPriority
            : slaRank(a.sla.state) - slaRank(b.sla.state)
        case 'new':
          return a.ageDays - b.ageDays
        default:
          return b.autoPriority - a.autoPriority
      }
    })

    const untriaged = all.filter((r) => r.sla.state !== 'answered')

    const countBy = (pick: (r: TriageRowView) => string | null) => {
      const map = new Map<string, number>()
      for (const row of all) {
        const key = pick(row)
        if (key) map.set(key, (map.get(key) ?? 0) + 1)
      }
      return map
    }

    const severityCounts = countBy((r) => r.severityKey)
    const typeCounts = countBy((r) => r.typeKey)

    return {
      rows: sorted,
      total: sorted.length,
      metrics: {
        untriaged: untriaged.length,
        overdue: all.filter((r) => r.sla.state === 'overdue').length,
        oldestUntriagedDays: Math.round(Math.max(0, ...untriaged.map((r) => r.ageDays))),
        awaitingReporter: all.filter((r) => r.awaitingReporter).length,
      },
      facets: {
        severities: severities
          .map((s) => ({ key: s.key, name: s.name, count: severityCounts.get(s.key) ?? 0 }))
          .filter((f) => f.count > 0),
        types: postTypes
          .map((t) => ({ key: t.key, name: t.name, count: typeCounts.get(t.key) ?? 0 }))
          .filter((f) => f.count > 0),
      },
    }
  },
}

/* ─────────────────────────── Вспомогательное ──────────────────────────── */

const ROADMAP_COLUMN_LIMIT = 3

/* ─────────────────────────── Бэклог ──────────────────────────── */

const backlogSelect = {
  id: true,
  title: true,
  problem: true,
  kind: true,
  estimate: true,
  targetRelease: true,
  rank: true,
  createdAt: true,
  updatedAt: true,
  theme: { select: { slug: true, name: true } },
  internalStatus: { select: { key: true } },
  owner: { select: { name: true } },
  /* Голоса связанных обращений — грубая оценка спроса. Настоящий охват
     с дедупликацией по человеку считает джоба (FR-612), и он появится
     отдельным полем: сумма голосов завышает ровно на тех, кто голосовал
     за несколько связанных обращений. */
  posts: { select: { post: { select: { voteCount: true } } } },
} as const

type BacklogRow = {
  id: string
  title: string
  problem: string
  kind: string
  estimate: string | null
  targetRelease: string | null
  createdAt: Date
  updatedAt: Date | null
  theme: { slug: string; name: string } | null
  internalStatus: { key: string } | null
  owner: { name: string } | null
  posts: { post: { voteCount: number } }[]
}

function toBacklogItemView(row: BacklogRow, now: Date): BacklogItemView {
  const status = row.internalStatus ? internalStatusByKey.get(row.internalStatus.key) : null
  return {
    id: row.id,
    title: row.title,
    problem: row.problem,
    kind: row.kind,
    kindName: backlogKindName(row.kind),
    themeName: row.theme?.name ?? null,
    themeSlug: row.theme?.slug ?? null,
    statusKey: row.internalStatus?.key ?? null,
    statusName: status?.name ?? row.internalStatus?.key ?? null,
    ownerName: row.owner?.name ?? null,
    estimate: row.estimate,
    targetRelease: row.targetRelease,
    postCount: row.posts.length,
    voteCount: row.posts.reduce((sum, p) => sum + p.post.voteCount, 0),
    updatedLabel: relativeLabel(row.updatedAt ?? row.createdAt, now),
  }
}

const CHANGE_KIND_NAMES: Record<ChangeKind, string> = {
  new: 'Новое',
  improved: 'Улучшено',
  fixed: 'Исправлено',
}

const entrySelect = {
  id: true,
  slug: true,
  version: true,
  title: true,
  lead: true,
  labels: true,
  types: true,
  publishedAt: true,
  changes: {
    orderBy: { position: 'asc' as const },
    select: { kind: true, title: true, body: true },
  },
  posts: {
    select: {
      post: {
        select: {
          slug: true,
          title: true,
          voteCount: true,
          board: { select: { slug: true } },
          status: { select: { key: true } },
          type: { select: { key: true } },
        },
      },
    },
  },
} as const

function toEntryView(
  row: {
    slug: string
    version: string | null
    title: string
    lead: string
    labels: string[]
    publishedAt: Date | null
    changes: { kind: string; title: string; body: string }[]
    posts: {
      post: {
        slug: string
        title: string
        voteCount: number
        board: { slug: string }
        status: { key: string }
        type: { key: string }
      }
    }[]
  },
): ChangelogEntryView {
  const publishedAt = row.publishedAt ?? new Date()
  return {
    slug: row.slug,
    version: row.version,
    title: row.title,
    lead: row.lead,
    publishedAt: publishedAt.toISOString(),
    /* Без «г.» на конце: Intl добавляет его к числовому году, в макете его нет. */
    publishedLabel:
      new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
        publishedAt,
      ) + ` ${publishedAt.getFullYear()}`,
    kinds: [...new Set(row.changes.map((c) => c.kind as ChangeKind))],
    labels: row.labels,
    changes: row.changes.map((c) => ({
      kind: c.kind as ChangeKind,
      title: c.title,
      body: c.body,
    })),
    closedPosts: row.posts.map(({ post }) => ({
      slug: post.slug,
      boardSlug: post.board.slug,
      title: post.title,
      status: toStatusView(post.status.key),
      count: post.voteCount,
      countLabel: countLabelOf(post.type.key),
    })),
  }
}

const releaseSelect = {
  id: true,
  slug: true,
  title: true,
  version: true,
  publishedAt: true,
  scheduledFor: true,
  _count: { select: { changes: true } },
  posts: {
    select: {
      post: {
        select: {
          id: true,
          slug: true,
          title: true,
          voteCount: true,
          board: { select: { slug: true } },
          status: { select: { key: true } },
          type: { select: { key: true } },
        },
      },
    },
  },
} as const

/** Дата со временем: у отложенной публикации важен час, а не только день. */
function momentLabel(at: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

function toReleaseView(
  row: {
    id: string
    slug: string
    title: string
    version: string | null
    publishedAt: Date | null
    scheduledFor: Date | null
    _count: { changes: number }
    posts: {
      post: {
        id: string
        slug: string
        title: string
        voteCount: number
        board: { slug: string }
        status: { key: string }
        type: { key: string }
      }
    }[]
  },
  subscriptionsByPost: Map<string, number>,
): ReleaseAdminView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    version: row.version,
    publishedLabel: row.publishedAt ? momentLabel(row.publishedAt) : null,
    scheduledLabel: row.scheduledFor ? momentLabel(row.scheduledFor) : null,
    changeCount: row._count.changes,
    posts: row.posts
      .map(({ post }) => ({
        slug: post.slug,
        boardSlug: post.board.slug,
        title: post.title,
        status: toStatusView(post.status.key),
        count: post.voteCount,
        countLabel: countLabelOf(post.type.key),
      }))
      .sort((a, b) => b.count - a.count),
    letters: row.posts.reduce(
      (sum, { post }) => sum + (subscriptionsByPost.get(post.id) ?? 0),
      0,
    ),
  }
}

/**
 * Счётчики панели фильтров.
 *
 * Счётчик каждого измерения считается с учётом остальных фильтров, но без
 * своего собственного — иначе выбор статуса обнуляет счётчики типов
 * и панель перестаёт помогать выбирать (FR-113).
 */
async function facetsFor(query: FeedQuery, matches: string[] | null) {
  const [statusRows, typeRows, categoryRows] = await Promise.all([
    prisma.post.groupBy({
      by: ['statusId'],
      where: feedWhere(query, matches, 'status'),
      _count: { _all: true },
    }),
    prisma.post.groupBy({
      by: ['typeId'],
      where: feedWhere(query, matches, 'type'),
      _count: { _all: true },
    }),
    prisma.post.groupBy({
      by: ['categoryId'],
      where: feedWhere(query, matches, 'category'),
      _count: { _all: true },
    }),
  ])

  const [statusRefs, typeRefs, categoryRefs] = await Promise.all([
    prisma.status.findMany({ select: { id: true, key: true } }),
    prisma.postType.findMany({ select: { id: true, key: true } }),
    prisma.category.findMany({
      where: { board: { slug: query.boardSlug } },
      orderBy: { position: 'asc' },
      select: { id: true, slug: true, name: true },
    }),
  ])

  const statusCounts = new Map(
    statusRows.map((r) => [
      statusRefs.find((s) => s.id === r.statusId)?.key ?? '',
      r._count._all,
    ]),
  )
  const typeCounts = new Map(
    typeRows.map((r) => [typeRefs.find((t) => t.id === r.typeId)?.key ?? '', r._count._all]),
  )
  const categoryCounts = new Map(
    categoryRows.map((r) => [
      categoryRefs.find((c) => c.id === r.categoryId)?.slug ?? '',
      r._count._all,
    ]),
  )

  const facet = (key: string, name: string, count: number): FacetView => ({ key, name, count })

  return {
    statuses: statuses
      .map((s) => facet(s.key, s.name, statusCounts.get(s.key) ?? 0))
      .filter((f) => f.count > 0),
    types: postTypes
      .filter((t) => listedTypeKeys.includes(t.key))
      .map((t) => facet(t.key, t.name, typeCounts.get(t.key) ?? 0))
      .filter((f) => f.count > 0),
    categories: categoryRefs
      .map((c) => facet(c.slug, c.name, categoryCounts.get(c.slug) ?? 0))
      .filter((f) => f.count > 0),
  }
}

function ageLabelOf(days: number): string {
  if (days < 1) return 'сегодня'
  if (days < 30) return `${Math.round(days)} д`
  return `${Math.round(days / 30)} мес`
}

const MS_PER_DAY = 86_400_000

function toTriageRow(
  row: {
    id: string
    slug: string
    ref: string
    title: string
    voteCount: number
    severity: string | null
    frequency: string | null
    priority: string | null
    createdAt: Date
    firstResponseAt: Date | null
    slaDueAt: Date | null
    needsInfoSince: Date | null
    regressionOf: string | null
    board: { slug: string }
    status: { key: string }
    type: { key: string }
    source: { key: string; name: string } | null
    assignee: { id: string; name: string } | null
    author: { segments: string[] } | null
  },
  now: Date,
): TriageRowView & { assigneeId: string | null; awaitingReporter: boolean } {
  const ageDays = (now.getTime() - row.createdAt.getTime()) / MS_PER_DAY
  const sla = slaState(row.slaDueAt, now, row.firstResponseAt)

  return {
    id: row.id,
    slug: row.slug,
    boardSlug: row.board.slug,
    ref: row.ref,
    title: row.title,
    typeName: postTypeByKey.get(row.type.key)?.name ?? row.type.key,
    typeKey: row.type.key,
    status: toStatusView(row.status.key),
    severityKey: row.severity,
    severityShort: severities.find((s) => s.key === row.severity)?.short ?? null,
    priorityKey: row.priority,
    sourceKey: row.source?.key ?? 'portal',
    sourceName: row.source?.name ?? 'портал',
    affectedCount: row.voteCount,
    ageLabel: ageLabelOf(ageDays),
    ageDays,
    sla: { state: sla.state, label: sla.label },
    assigneeName: row.assignee?.name ?? null,
    assigneeInitials: row.assignee ? initials(row.assignee.name) : null,
    regression: row.regressionOf !== null,
    /* Сегмент репортера — вход в автооценку: без него громкие важнее
       платящих (FR-612). */
    autoPriority: autoPriority({
      severity: row.severity,
      frequency: row.frequency,
      affectedCount: row.voteCount,
      segment: row.author?.segments[0] ?? 'free',
    }),
    assigneeId: row.assignee?.id ?? null,
    awaitingReporter: row.needsInfoSince !== null,
  }
}

function slaRank(state: TriageRowView['sla']['state']): number {
  return { overdue: 0, soon: 1, ok: 2, none: 3, answered: 4 }[state]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Идентификатор приходит из сессии, но попасть сюда может и подделанное
 * значение. Запрос с ним в колонку uuid падает ошибкой типа — проверяем
 * до обращения к базе и отвечаем пустым профилем.
 */
function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
