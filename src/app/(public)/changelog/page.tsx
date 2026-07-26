import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { product } from '@config/product'
import { formatCount } from '@/core/content'
import { queries } from '@/queries'
import { KindBadge } from '@/ui/changelog/kind-badge'
import type { ChangeKind, ChangelogEntryView } from '@/queries/types'

export const metadata: Metadata = {
  title: 'Что нового',
  description: 'Лента релизов и обращения, из которых они выросли.',
}

const KINDS: ChangeKind[] = ['new', 'improved', 'fixed']

function readKinds(value: string | string[] | undefined): ChangeKind[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : value.split(',')
  return raw.filter((k): k is ChangeKind => KINDS.includes(k as ChangeKind))
}

/**
 * Лента релизов (FR-161). Обратный хронологический порядок, фильтр по типу
 * изменения и «Показать ещё» — бесконечный скролл ломает возврат по ссылке.
 */
export default async function ChangelogPage({
  searchParams,
}: PageProps<'/changelog'>) {
  if (!product.features.changelog) notFound()

  const params = await searchParams
  const kinds = readKinds(params['kind'])
  const labels = params['label']
    ? [Array.isArray(params['label']) ? params['label'][0]! : params['label']]
    : []
  const limit = Number(params['limit']) || 3

  const result = await queries.getChangelog({ kinds, labels, limit })

  const hrefFor = (kind: ChangeKind | null): Route =>
    (kind ? `/changelog?kind=${kind}` : '/changelog') as Route

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-12 md:px-8 lg:px-10">
      <div className="max-w-[46rem]">
        <h1 className="text-h1 font-light text-ink md:text-display">
          Что нового <span className="font-extrabold">в {product.name}</span>
        </h1>
        <p className="mt-5 text-body-l text-muted">
          Ссылки ведут на обращения, из которых эти изменения выросли.
        </p>

        <nav aria-label="Фильтр по типу" className="mt-8 flex flex-wrap gap-2">
          <FilterTab href={hrefFor(null)} active={kinds.length === 0}>
            Все
          </FilterTab>
          {result.kindFacets.map((facet) => (
            <FilterTab
              key={facet.key}
              href={hrefFor(facet.key as ChangeKind)}
              active={kinds.includes(facet.key as ChangeKind)}
            >
              {facet.name}
            </FilterTab>
          ))}
        </nav>

        {result.items.length === 0 ? (
          <p className="mt-10 rounded-card border border-dashed border-line px-6 py-12 text-center text-body text-muted">
            Релизов такого типа пока не было.
          </p>
        ) : (
          <ol className="mt-10 space-y-12">
            {result.items.map((entry) => (
              <li key={entry.slug}>
                <EntryPreview entry={entry} kinds={kinds} />
              </li>
            ))}
          </ol>
        )}

        {result.nextCursor && (
          <div className="mt-12 flex flex-col items-center gap-2">
            <Link
              href={`/changelog?limit=${limit + 3}${kinds.length ? `&kind=${kinds.join(',')}` : ''}` as Route}
              className="rounded-pill border border-line bg-surface px-5 py-2.5 text-body font-semibold text-ink transition-colors hover:bg-track"
            >
              Показать ещё
            </Link>
            <span className="font-mono text-label uppercase text-faint">
              показано {formatCount(result.items.length)} из{' '}
              {formatCount(result.total)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: Route
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        'rounded-pill px-3.5 py-1.5 text-body font-semibold transition-colors ' +
        (active ? 'bg-ink text-surface' : 'text-muted hover:bg-track hover:text-ink')
      }
    >
      {children}
    </Link>
  )
}

function EntryPreview({
  entry,
  kinds,
}: {
  entry: ChangelogEntryView
  kinds: ChangeKind[]
}) {
  /* При активном фильтре показываем только подходящие изменения: иначе
     фильтр отвечает «в этом релизе что-то исправляли», но не показывает что. */
  const changes = kinds.length
    ? entry.changes.filter((c) => kinds.includes(c.kind))
    : entry.changes

  return (
    <article>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {entry.version && (
          <span className="font-mono text-h3 font-semibold text-ink">
            {entry.version}
          </span>
        )}
        <time dateTime={entry.publishedAt} className="text-small text-faint">
          {entry.publishedLabel}
        </time>
      </div>

      <h2 className="text-h2 font-extrabold tracking-tight text-ink">
        <Link href={`/changelog/${entry.slug}`} className="hover:text-ink-hover">
          {entry.title}
        </Link>
      </h2>

      <ul className="mt-5 space-y-4">
        {changes.map((change, i) => (
          <li key={i} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <div className="sm:w-28 sm:shrink-0 sm:pt-0.5">
              <KindBadge kind={change.kind} />
            </div>
            <p className="text-body leading-relaxed text-ink-2">{change.body}</p>
          </li>
        ))}
      </ul>

      {entry.closedPosts.length > 0 && (
        <p className="mt-5 text-small text-faint">
          Закрыто обращений: {formatCount(entry.closedPosts.length)} ·{' '}
          <Link
            href={`/changelog/${entry.slug}`}
            className="underline underline-offset-2 hover:text-ink"
          >
            какие именно
          </Link>
        </p>
      )}
    </article>
  )
}
