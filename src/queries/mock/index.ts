/**
 * Реализация контракта запросов на фикстурах. ВЫКИДЫВАЕТСЯ В ИТЕРАЦИИ B1.
 *
 * Важное ограничение, которое делает прототип полезным: доменные правила здесь
 * настоящие. Trending считается формулой из 02-data-model.md, пагинация —
 * курсорная, счётчики фильтров — с учётом остальных фильтров. Меняется
 * хранилище, не логика.
 */

import { product } from '@config/product'
import { statuses, statusByKey } from '@config/statuses'
import { postTypes, postTypeByKey } from '@config/post-types'
import { severities } from '@config/scoring'
import type { Privacy } from '@config/post-types'
import { autoPriority } from '@/core/domain/triage/priority'
import { slaDueAt, slaState } from '@/core/domain/triage/sla'
import {
  isSearchable,
  SIMILARITY_THRESHOLD,
  wordSimilarity,
} from '@/core/domain/intake/similar'
import { trendScore } from '@/core/domain/shared/trending'
import { relativeLabel } from '@/core/format'
import { slugify } from '@/core/slug'
import type {
  BoardView,
  CommentView,
  FacetView,
  FeedQuery,
  FeedResult,
  PersonView,
  PostCardView,
  PostPageResult,
  PostTypeView,
  ProfileView,
  ChangelogEntryView,
  ChangelogQuery,
  ChangelogResult,
  ChangeKind,
  QueryPort,
  RoadmapCardView,
  RoadmapView,
  SimilarPostView,
  SimilarQuery,
  TriageQuery,
  TriageQueueView,
  TriageRowView,
  StatusChangeView,
  StatusView,
} from '@/queries/types'

import {
  categories,
  changelogSeeds,
  commentThreads,
  detailsTail,
  etaByTitle,
  genericComments,
  mergedInto,
  people,
  postDetails,
  intakeSourceNames,
  postSeeds,
  triageByTitle,
  type ChangelogSeed,
  type CommentSeed,
  type PostSeed,
} from './seeds'

const MS_PER_DAY = 86_400_000
/** Больше этого числа отметок о голосах не храним: вклад в сумму масштабируем. */
const VOTE_SAMPLE_CAP = 400

/** Детерминированный PRNG: лента должна быть одинаковой на сервере и после «Показать ещё». */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface MockPost {
  id: string
  slug: string
  seed: PostSeed
  /** Возрасты голосов в днях — из них считается trend_score. */
  voteAgesDays: number[]
  voteScale: number
  createdAgoDays: number
  updatedAgoDays: number
}

function buildPosts(): MockPost[] {
  return postSeeds.map((seed, i) => {
    const rand = mulberry32(i * 7919 + 13)
    const sample = Math.min(seed.votes, VOTE_SAMPLE_CAP)
    const voteScale = sample === 0 ? 0 : seed.votes / sample

    const recentCount = Math.round(sample * seed.recency)
    const recentWindow = Math.min(14, seed.ageDays)
    const voteAgesDays: number[] = []

    for (let v = 0; v < recentCount; v++) {
      voteAgesDays.push(rand() * recentWindow)
    }
    for (let v = recentCount; v < sample; v++) {
      voteAgesDays.push(recentWindow + rand() * Math.max(0, seed.ageDays - recentWindow))
    }

    return {
      id: `post-${String(i + 1).padStart(3, '0')}`,
      slug: slugify(seed.title),
      seed,
      voteAgesDays,
      voteScale,
      createdAgoDays: seed.ageDays,
      updatedAgoDays: seed.ageDays * (1 - 0.8 * seed.recency),
    }
  })
}

/** Строится один раз на процесс: фикстуры неизменны. */
const posts = buildPosts()

function toStatusView(key: string): StatusView {
  const s = statusByKey.get(key)
  if (!s) throw new Error(`Неизвестный статус: ${key}`)
  return { key: s.key, name: s.name, shape: s.shape, isTerminal: s.isTerminal }
}

function toTypeView(key: string): PostTypeView {
  const t = postTypeByKey.get(key)
  if (!t) throw new Error(`Неизвестный тип обращения: ${key}`)
  return {
    key: t.key,
    name: t.name,
    allowsVotes: t.allowsVotes,
    voteLabel: t.voteLabel,
    countLabel: t.countLabel,
  }
}

function categoryName(boardSlug: string, slug: string): string | null {
  return categories[boardSlug]?.find((c) => c.slug === slug)?.name ?? null
}

function toCardView(post: MockPost, now: Date): PostCardView {
  const { seed } = post
  const type = postTypeByKey.get(seed.typeKey)
  const updatedAt = new Date(now.getTime() - post.updatedAgoDays * MS_PER_DAY)
  return {
    id: post.id,
    slug: post.slug,
    boardSlug: seed.boardSlug,
    title: seed.title,
    excerpt: seed.excerpt,
    type: toTypeView(seed.typeKey),
    status: toStatusView(seed.statusKey),
    categoryName: categoryName(seed.boardSlug, seed.categorySlug),
    categorySlug: seed.categorySlug,
    count: seed.votes,
    commentCount: seed.comments,
    pinned: seed.pinned ?? false,
    privacy: (type?.defaultPrivacy ?? 'public') as Privacy,
    hasTeamReply: seed.teamReply ?? false,
    awaitingReporter: seed.awaitingReporter ?? false,
    voted: false,
    updatedAt: updatedAt.toISOString(),
    updatedLabel: relativeLabel(updatedAt, now),
  }
}

/** Только то, что вообще может попасть в публичную ленту. */
function isPubliclyListed(post: MockPost): boolean {
  return postTypeByKey.get(post.seed.typeKey)?.publicFeed ?? false
}

function matchesSearch(post: MockPost, q: string): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  return (
    post.seed.title.toLowerCase().includes(needle) ||
    post.seed.excerpt.toLowerCase().includes(needle)
  )
}

function sortValue(post: MockPost, sort: FeedQuery['sort'], now: Date): number {
  switch (sort) {
    case 'top':
      return post.seed.votes
    case 'new':
      return -post.createdAgoDays
    case 'trending': {
      const dates = post.voteAgesDays.map(
        (age) => new Date(now.getTime() - age * MS_PER_DAY),
      )
      return trendScore(dates, now) * post.voteScale
    }
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8')
}

function facetsFor(
  pool: MockPost[],
  query: FeedQuery,
): { statuses: FacetView[]; types: FacetView[]; categories: FacetView[] } {
  /* Счётчик каждого фильтра считается с учётом остальных, но без самого себя —
     иначе выбор статуса обнуляет счётчики типов и панель становится бесполезной. */
  const count = (
    items: MockPost[],
    pick: (p: MockPost) => string,
    skip: 'status' | 'type' | 'category',
  ) => {
    const map = new Map<string, number>()
    for (const p of items) {
      if (skip !== 'status' && query.statusKeys.length && !query.statusKeys.includes(p.seed.statusKey)) continue
      if (skip !== 'type' && query.typeKeys.length && !query.typeKeys.includes(p.seed.typeKey)) continue
      if (skip !== 'category' && query.categorySlugs.length && !query.categorySlugs.includes(p.seed.categorySlug)) continue
      const key = pick(p)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }

  const statusCounts = count(pool, (p) => p.seed.statusKey, 'status')
  const typeCounts = count(pool, (p) => p.seed.typeKey, 'type')
  const categoryCounts = count(pool, (p) => p.seed.categorySlug, 'category')

  const boardCategories = categories[query.boardSlug] ?? []

  return {
    statuses: statuses
      .map((s) => ({ key: s.key, name: s.name, count: statusCounts.get(s.key) ?? 0 }))
      .filter((f) => f.count > 0),
    types: postTypes
      .filter((t) => t.publicFeed)
      .map((t) => ({ key: t.key, name: t.name, count: typeCounts.get(t.key) ?? 0 }))
      .filter((f) => f.count > 0),
    categories: boardCategories
      .map((c) => ({ key: c.slug, name: c.name, count: categoryCounts.get(c.slug) ?? 0 }))
      .filter((f) => f.count > 0),
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function toPerson(index: number): PersonView {
  const person = people[index % people.length]!
  return {
    name: person.name,
    initials: initials(person.name),
    role: person.role,
    isTeam: person.team ?? false,
  }
}

/** Человекочитаемая ссылка: её называют в поддержке и в письмах. */
function refFor(index: number): string {
  return `RTM-${4000 + index * 37}`
}

/**
 * Цепочка статусов, через которые обращение прошло к текущему.
 * В фазе B её заменит таблица status_change — форма данных та же.
 */
const STATUS_CHAINS: Record<string, string[]> = {
  open: ['open'],
  'needs-info': ['needs-info', 'open'],
  planned: ['planned', 'open'],
  building: ['building', 'planned', 'open'],
  completed: ['completed', 'building', 'planned', 'open'],
  'not-reproducible': ['not-reproducible', 'needs-info', 'open'],
  duplicate: ['duplicate', 'open'],
  'wont-fix': ['wont-fix', 'open'],
}

function buildStatusHistory(post: MockPost, now: Date): StatusChangeView[] {
  const chain = STATUS_CHAINS[post.seed.statusKey] ?? [post.seed.statusKey]
  const span = post.createdAgoDays - post.updatedAgoDays
  return chain.map((key, i) => {
    const ago = post.updatedAgoDays + (span * i) / Math.max(1, chain.length - 1)
    const at = new Date(now.getTime() - ago * MS_PER_DAY)
    return {
      status: toStatusView(key),
      label: relativeLabel(at, now),
      /* Кто сменил статус, известно только для командных переходов. */
      byName: i === 0 && key !== 'open' ? toPerson(9).name : null,
    }
  })
}

function buildComments(post: MockPost, now: Date): CommentView[] {
  const rand = mulberry32(post.seed.title.length * 104729 + 7)
  const at = (agoDays: number) => new Date(now.getTime() - agoDays * MS_PER_DAY)

  const fromSeed = (seed: CommentSeed, path: string): CommentView => {
    const when = at(seed.agoDays)
    return {
      id: `${post.id}-c${path}`,
      author: toPerson(seed.author),
      createdAt: when.toISOString(),
      createdLabel: relativeLabel(when, now),
      body: seed.body,
      likeCount: seed.likes,
      pinned: seed.pinned ?? false,
      replies: (seed.replies ?? []).map((r, i) => fromSeed(r, `${path}-${i}`)),
    }
  }

  const handwritten = commentThreads[post.seed.title]
  if (handwritten) return handwritten.map((c, i) => fromSeed(c, String(i)))

  const count = Math.min(post.seed.comments, 4)
  return Array.from({ length: count }, (_, i) => {
    const agoDays = post.updatedAgoDays + rand() * Math.max(1, post.createdAgoDays - post.updatedAgoDays)
    const when = at(agoDays)
    return {
      id: `${post.id}-c${i}`,
      author: toPerson(Math.floor(rand() * (people.length - 2))),
      createdAt: when.toISOString(),
      createdLabel: relativeLabel(when, now),
      body: genericComments[Math.floor(rand() * genericComments.length)]!,
      likeCount: Math.floor(rand() * 12),
      pinned: false,
      replies: [],
    }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function buildVoters(post: MockPost): PersonView[] {
  const rand = mulberry32(post.seed.votes + 31)
  const shown = Math.min(post.seed.votes, 5)
  const picked = new Set<number>()
  while (picked.size < shown) picked.add(Math.floor(rand() * (people.length - 2)))
  return [...picked].map(toPerson)
}

function detailsFor(post: MockPost): string[] {
  return postDetails[post.seed.title] ?? [post.seed.excerpt, detailsTail]
}

/**
 * Смерженные дубликаты как самостоятельные адреса: по их ссылке из письма
 * или из выдачи пользователь обязан попасть на целевое обращение, а не в 404.
 */
interface Ghost {
  slug: string
  title: string
  ref: string
  boardSlug: string
  targetSlug: string
  targetTitle: string
}

const ghosts: Ghost[] = Object.entries(mergedInto).flatMap(([targetTitle, dupes]) => {
  const target = posts.find((p) => p.seed.title === targetTitle)
  if (!target) return []
  return dupes.map((d, i) => ({
    slug: slugify(d.title),
    title: d.title,
    ref: `RTM-${5000 + i * 131}`,
    boardSlug: target.seed.boardSlug,
    targetSlug: target.slug,
    targetTitle,
  }))
})


/* ─────────────────────────── Роадмап ─────────────────────────── */

const ROADMAP_COLUMN_LIMIT = 3

function boardName(slug: string): string {
  return product.boards.find((b) => b.slug === slug)?.name ?? slug
}

function toRoadmapCard(post: MockPost): RoadmapCardView {
  const type = postTypeByKey.get(post.seed.typeKey)
  return {
    slug: post.slug,
    boardSlug: post.seed.boardSlug,
    boardName: boardName(post.seed.boardSlug),
    title: post.seed.title,
    typeName: type?.name ?? post.seed.typeKey,
    categoryName: categoryName(post.seed.boardSlug, post.seed.categorySlug),
    count: post.seed.votes,
    countLabel: type?.countLabel ?? ['голос', 'голоса', 'голосов'],
    eta: etaByTitle[post.seed.title] ?? null,
  }
}

/* ────────────────────────── Changelog ────────────────────────── */

function toEntryView(seed: ChangelogSeed, now: Date): ChangelogEntryView {
  const publishedAt = new Date(now.getTime() - seed.agoDays * MS_PER_DAY)

  const closedPosts = seed.closes.flatMap((title) => {
    const post = posts.find((p) => p.seed.title === title)
    if (!post) return []
    const type = postTypeByKey.get(post.seed.typeKey)
    return [
      {
        slug: post.slug,
        boardSlug: post.seed.boardSlug,
        title: post.seed.title,
        status: toStatusView(post.seed.statusKey),
        count: post.seed.votes,
        countLabel: type?.countLabel ?? ['голос', 'голоса', 'голосов'],
      },
    ]
  })

  return {
    slug: seed.slug,
    version: seed.version,
    title: seed.title,
    lead: seed.lead,
    publishedAt: publishedAt.toISOString(),
    /* Без «г.» на конце: Intl добавляет его к числовому году, в макете его нет. */
    publishedLabel: new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
    }).format(publishedAt) + ` ${publishedAt.getFullYear()}`,
    kinds: [...new Set(seed.changes.map((c) => c.kind))],
    labels: seed.labels,
    changes: seed.changes,
    closedPosts,
  }
}

const CHANGE_KIND_NAMES: Record<ChangeKind, string> = {
  new: 'Новое',
  improved: 'Улучшено',
  fixed: 'Исправлено',
}


/* ──────────────────────────── Триаж ──────────────────────────── */

const DEFAULT_TRIAGE = {
  severity: 'minor',
  frequency: 'sometimes',
  source: 'portal',
  segment: 'free',
} as const

function ageLabelOf(days: number): string {
  if (days < 1) return 'сегодня'
  if (days < 30) return `${Math.round(days)} д`
  return `${Math.round(days / 30)} мес`
}

function toTriageRow(post: MockPost, index: number, now: Date): TriageRowView {
  const seed = post.seed
  const triage = triageByTitle[seed.title]
  const severity = triage?.severity ?? (seed.typeKey === 'bug' ? DEFAULT_TRIAGE.severity : null)
  const frequency = triage?.frequency ?? DEFAULT_TRIAGE.frequency
  const source = triage?.source ?? DEFAULT_TRIAGE.source
  const segment = triage?.segment ?? DEFAULT_TRIAGE.segment

  const createdAt = new Date(now.getTime() - post.createdAgoDays * MS_PER_DAY)
  const due = slaDueAt(createdAt, seed.typeKey, severity)
  /* Первый ответ состоялся, если команда отписалась в треде. Флаг из данных
     триажа уточняет это для багов, но `teamReply` значит ровно то же самое
     и для идей — иначе годовалая идея с ответом команды считается просроченной
     и очередь показывает катастрофу там, где её нет. */
  const answered = triage?.answered ?? seed.teamReply ?? false
  const firstResponseAt = answered
    ? new Date(now.getTime() - post.updatedAgoDays * MS_PER_DAY)
    : null

  const assignee = triage?.assignee !== undefined ? toPerson(triage.assignee) : null

  return {
    id: post.id,
    slug: post.slug,
    boardSlug: seed.boardSlug,
    ref: refFor(index),
    title: seed.title,
    typeName: postTypeByKey.get(seed.typeKey)?.name ?? seed.typeKey,
    typeKey: seed.typeKey,
    status: toStatusView(seed.statusKey),
    severityKey: severity,
    severityShort: severities.find((s) => s.key === severity)?.short ?? null,
    priorityKey: triage?.priority ?? null,
    sourceKey: source,
    sourceName: intakeSourceNames[source],
    affectedCount: seed.votes,
    ageLabel: ageLabelOf(post.createdAgoDays),
    ageDays: post.createdAgoDays,
    sla: (() => {
      const view = slaState(due, now, firstResponseAt)
      return { state: view.state, label: view.label }
    })(),
    assigneeName: assignee?.name ?? null,
    assigneeInitials: assignee?.initials ?? null,
    regression: triage?.regression ?? false,
    autoPriority: autoPriority({
      severity,
      frequency,
      affectedCount: seed.votes,
      segment,
    }),
  }
}

export const mockQueries: QueryPort = {
  async listBoards(): Promise<BoardView[]> {
    return product.boards
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        slug: b.slug,
        name: b.name,
        description: b.description,
        visibility: b.visibility,
        postCount: posts.filter(
          (p) => p.seed.boardSlug === b.slug && isPubliclyListed(p),
        ).length,
        categories: categories[b.slug] ?? [],
        requireCategory: b.requireCategory ?? false,
      }))
  },

  async getBoard(slug: string): Promise<BoardView | null> {
    const all = await mockQueries.listBoards()
    return all.find((b) => b.slug === slug) ?? null
  },

  async getFeed(query: FeedQuery): Promise<FeedResult> {
    const now = new Date()
    const limit = query.limit ?? product.limits.feedPageSize

    const pool = posts.filter(
      (p) =>
        p.seed.boardSlug === query.boardSlug &&
        isPubliclyListed(p) &&
        matchesSearch(p, query.search),
    )

    const filtered = pool.filter(
      (p) =>
        (!query.statusKeys.length || query.statusKeys.includes(p.seed.statusKey)) &&
        (!query.typeKeys.length || query.typeKeys.includes(p.seed.typeKey)) &&
        (!query.categorySlugs.length ||
          query.categorySlugs.includes(p.seed.categorySlug)),
    )

    /* Закреплённые — всегда сверху (FR-216), внутри групп — выбранная сортировка. */
    const sorted = filtered.slice().sort((a, b) => {
      if (a.seed.pinned !== b.seed.pinned) return a.seed.pinned ? -1 : 1
      const diff = sortValue(b, query.sort, now) - sortValue(a, query.sort, now)
      return diff !== 0 ? diff : a.id.localeCompare(b.id)
    })

    /* Курсор keyset: продолжаем строго после элемента с этим id. */
    let start = 0
    if (query.cursor) {
      const afterId = decodeCursor(query.cursor)
      const at = sorted.findIndex((p) => p.id === afterId)
      start = at === -1 ? 0 : at + 1
    }

    const slice = sorted.slice(start, start + limit)
    const last = slice.at(-1)
    const hasMore = start + slice.length < sorted.length

    return {
      items: slice.map((p) => toCardView(p, now)),
      nextCursor: hasMore && last ? encodeCursor(last.id) : null,
      total: sorted.length,
      facets: facetsFor(pool, query),
    }
  },

  async getPost(boardSlug: string, slug: string): Promise<PostPageResult | null> {
    const ghost = ghosts.find((g) => g.boardSlug === boardSlug && g.slug === slug)
    if (ghost) {
      return {
        kind: 'merged',
        title: ghost.title,
        target: {
          boardSlug: ghost.boardSlug,
          slug: ghost.targetSlug,
          title: ghost.targetTitle,
        },
      }
    }

    const index = posts.findIndex(
      (p) => p.seed.boardSlug === boardSlug && p.slug === slug,
    )
    if (index === -1) return null

    const post = posts[index]!
    const now = new Date()
    const created = new Date(now.getTime() - post.createdAgoDays * MS_PER_DAY)
    const dupes = mergedInto[post.seed.title] ?? []

    return {
      kind: 'post',
      ...toCardView(post, now),
      ref: refFor(index),
      details: detailsFor(post),
      author: toPerson(index * 3 + 1),
      createdAt: created.toISOString(),
      createdLabel: relativeLabel(created, now),
      eta: etaByTitle[post.seed.title] ?? null,
      statusHistory: buildStatusHistory(post, now),
      voters: buildVoters(post),
      votersTotal: post.seed.votes,
      votersHidden: !product.features.voterList,
      merged: dupes.map((d, i) => ({
        title: d.title,
        slug: slugify(d.title),
        ref: `RTM-${5000 + i * 131}`,
        movedVotes: d.movedVotes,
      })),
      comments: buildComments(post, now),
      subscribed: false,
    }
  },

  async findSimilar(query: SimilarQuery): Promise<SimilarPostView[]> {
    if (!isSearchable(query.title)) return []
    const now = new Date()

    /* Ищем по всей доске, а не только среди обращений того же типа: человек
       часто заводит багом то, что уже лежит идеей, и наоборот (FR-505). */
    return posts
      .filter((p) => p.seed.boardSlug === query.boardSlug && isPubliclyListed(p))
      .map((p) => ({ post: p, score: wordSimilarity(query.title, p.seed.title) }))
      .filter(({ score }) => score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score || b.post.seed.votes - a.post.seed.votes)
      .slice(0, 4)
      .map(({ post: p }) => {
        const card = toCardView(p, now)
        return {
          slug: card.slug,
          boardSlug: card.boardSlug,
          title: card.title,
          status: card.status,
          type: card.type,
          count: card.count,
          commentCount: card.commentCount,
          voted: card.voted,
          closedReason: closedReasonFor(p),
        }
      })
  },

  async getRoadmap(boardSlug?: string, expandStatusKey?: string): Promise<RoadmapView> {
    /* Роадмап агрегирует обращения со ВСЕХ досок (FR-151): пользователю
       неинтересно, в какой из них лежит запрос, — интересно, что с ним будет. */
    const pool = posts.filter(
      (p) =>
        isPubliclyListed(p) &&
        (!boardSlug || p.seed.boardSlug === boardSlug),
    )

    const columns = statuses
      .filter((s) => s.showOnRoadmap)
      .sort((a, b) => a.position - b.position)
      .map((status) => {
        const items = pool
          .filter((p) => p.seed.statusKey === status.key)
          /* Внутри колонки — по голосам: наверху то, чего ждут сильнее всего. */
          .sort((a, b) => b.seed.votes - a.seed.votes)
        const expanded = status.key === expandStatusKey
        return {
          status: toStatusView(status.key),
          total: items.length,
          items: (expanded ? items : items.slice(0, ROADMAP_COLUMN_LIMIT)).map(
            toRoadmapCard,
          ),
          expanded,
        }
      })

    return {
      columns,
      boards: product.boards
        .filter((b) => b.visibility === 'public')
        .sort((a, b) => a.position - b.position)
        .map((b) => ({ slug: b.slug, name: b.name })),
    }
  },

  async getChangelog(query: ChangelogQuery): Promise<ChangelogResult> {
    const now = new Date()
    const limit = query.limit ?? 3

    const all = changelogSeeds
      .slice()
      .sort((a, b) => a.agoDays - b.agoDays)
      .map((seed) => toEntryView(seed, now))

    const matched = all.filter(
      (entry) =>
        (!query.kinds.length || entry.kinds.some((k) => query.kinds.includes(k))) &&
        (!query.labels.length || entry.labels.some((l) => query.labels.includes(l))),
    )

    let start = 0
    if (query.cursor) {
      const afterSlug = decodeCursor(query.cursor)
      const at = matched.findIndex((e) => e.slug === afterSlug)
      start = at === -1 ? 0 : at + 1
    }

    const slice = matched.slice(start, start + limit)
    const last = slice.at(-1)
    const hasMore = start + slice.length < matched.length

    const countBy = <T extends string>(pick: (e: ChangelogEntryView) => T[]) => {
      const map = new Map<T, number>()
      for (const entry of all) {
        for (const value of new Set(pick(entry))) {
          map.set(value, (map.get(value) ?? 0) + 1)
        }
      }
      return map
    }

    const kindCounts = countBy((e) => e.kinds)
    const labelCounts = countBy((e) => e.labels)

    return {
      items: slice,
      nextCursor: hasMore && last ? encodeCursor(last.slug) : null,
      total: matched.length,
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
    const seed = changelogSeeds.find((e) => e.slug === slug)
    return seed ? toEntryView(seed, new Date()) : null
  },

  async getProfile(): Promise<ProfileView> {
    const now = new Date()
    const visible = posts.filter(isPubliclyListed)

    /* Принадлежность обращений пользователю в фикстурах синтетическая:
       настоящая связь появится в B1 вместе с author_id и таблицей vote. */
    const authored = visible.filter((_, i) => i % 9 === 2).map((p) => toCardView(p, now))
    const voted = visible.filter((_, i) => i % 4 === 1).map((p) => toCardView(p, now))

    return {
      authored,
      voted,
      stats: {
        authored: authored.length,
        voted: voted.length,
        inProgress: [...authored, ...voted].filter(
          (p) => p.status.key === 'building' || p.status.key === 'planned',
        ).length,
      },
    }
  },

  async getTriageQueue(query: TriageQuery): Promise<TriageQueueView> {
    const now = new Date()

    /* В очередь попадает всё незакрытое, включая вопросы: они тоже требуют
       ответа, просто не идут в бэклог (FR-507). */
    const all = posts
      .map((post, index) => ({ post, row: toTriageRow(post, index, now) }))
      .filter(({ row }) => !row.status.isTerminal)

    const matched = all.filter(({ row }) => {
      if (query.overdueOnly && row.sla.state !== 'overdue') return false
      if (query.severityKeys.length && !query.severityKeys.includes(row.severityKey ?? ''))
        return false
      if (query.typeKeys.length && !query.typeKeys.includes(row.typeKey)) return false
      if (query.search && !row.title.toLowerCase().includes(query.search.toLowerCase()))
        return false
      return true
    })

    const sorted = matched.slice().sort((a, b) => {
      /* Отвеченное уходит вниз в любой сортировке: очередь — про то, что ждёт
         действия, а не про то, что уже разобрано. */
      const answered = (r: typeof a) => r.row.sla.state === 'answered'
      if (answered(a) !== answered(b)) return answered(a) ? 1 : -1

      /* Среди требующих действия регрессии идут первыми: повтор ранее
         исправленного — сигнал о сбое процесса, а не рядовое обращение (FR-525). */
      if (a.row.regression !== b.row.regression) return a.row.regression ? -1 : 1

      switch (query.sort) {
        case 'sla':
          return a.row.sla.state === b.row.sla.state
            ? b.row.autoPriority - a.row.autoPriority
            : slaRank(a.row.sla.state) - slaRank(b.row.sla.state)
        case 'new':
          return a.row.ageDays - b.row.ageDays
        default:
          return b.row.autoPriority - a.row.autoPriority
      }
    })

    const untriaged = all.filter(({ row }) => row.sla.state !== 'answered')

    const countBy = (pick: (r: TriageRowView) => string | null) => {
      const map = new Map<string, number>()
      for (const { row } of all) {
        const key = pick(row)
        if (key) map.set(key, (map.get(key) ?? 0) + 1)
      }
      return map
    }

    const severityCounts = countBy((r) => r.severityKey)
    const typeCounts = countBy((r) => r.typeKey)

    return {
      rows: sorted.map(({ row }) => row),
      total: sorted.length,
      metrics: {
        untriaged: untriaged.length,
        overdue: all.filter(({ row }) => row.sla.state === 'overdue').length,
        oldestUntriagedDays: Math.round(
          Math.max(0, ...untriaged.map(({ row }) => row.ageDays)),
        ),
        awaitingReporter: all.filter(({ post }) => post.seed.awaitingReporter).length,
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

function slaRank(state: TriageRowView['sla']['state']): number {
  return { overdue: 0, soon: 1, ok: 2, none: 3, answered: 4 }[state]
}

/**
 * Публичная причина отказа по ранее закрытому обращению (FR-643). В фазе B
 * она придёт из `post.resolution_reason_public`, здесь — из статуса.
 */
function closedReasonFor(post: MockPost): string | null {
  switch (post.seed.statusKey) {
    case 'wont-fix':
      return 'Мы отказались от этого: решение ломает разграничение доступа между филиалами.'
    case 'not-reproducible':
      return 'Не удалось воспроизвести. Если у вас повторяется — напишите шаги, откроем заново.'
    case 'duplicate':
      return 'Это обращение объединено с другим.'
    default:
      return null
  }
}
