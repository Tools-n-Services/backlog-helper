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
import type { Privacy } from '@config/post-types'
import { trendScore } from '@/core/domain/shared/trending'
import { relativeLabel } from '@/core/format'
import { slugify } from '@/core/slug'
import type {
  BoardView,
  FacetView,
  FeedQuery,
  FeedResult,
  PostCardView,
  PostTypeView,
  QueryPort,
  StatusView,
} from '@/queries/types'

import { categories, postSeeds, type PostSeed } from './seeds'

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
}
