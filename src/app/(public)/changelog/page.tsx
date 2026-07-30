import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { settings } from '@/core/settings'
import { fill, formatCount, type Dictionary, type Locale } from '@/core/content'
import { content, locale } from '@/core/locale'
import { queries } from '@/queries'
import { KindBadge, kindNames } from '@/ui/changelog/kind-badge'
import type { ChangeKind, ChangelogEntryView } from '@/queries/types'

export async function generateMetadata(): Promise<Metadata> {
  const t = await content()
  return { title: t.changelog.title, description: t.changelog.description }
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
  if (!settings().features.changelog) notFound()

  const [params, t, lang] = await Promise.all([searchParams, content(), locale()])
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
          {t.changelog.headingLight}{' '}
          <span className="font-extrabold">
            {t.changelog.headingBoldPrefix} {settings().name}
          </span>
        </h1>
        <p className="mt-5 text-body-l text-muted">{t.changelog.lead}</p>

        <nav aria-label={t.changelog.typeFilter} className="mt-8 flex flex-wrap gap-2">
          <FilterTab href={hrefFor(null)} active={kinds.length === 0}>
            {t.changelog.all}
          </FilterTab>
          {result.kindFacets.map((facet) => (
            <FilterTab
              key={facet.key}
              href={hrefFor(facet.key as ChangeKind)}
              active={kinds.includes(facet.key as ChangeKind)}
            >
              {kindNames(t)[facet.key as ChangeKind] ?? facet.name}
            </FilterTab>
          ))}
        </nav>

        {result.items.length === 0 ? (
          <p className="mt-10 rounded-card border border-dashed border-line px-6 py-12 text-center text-body text-muted">
            {t.changelog.emptyType}
          </p>
        ) : (
          <ol className="mt-10 space-y-12">
            {result.items.map((entry) => (
              <li key={entry.slug}>
                <EntryPreview entry={entry} kinds={kinds} t={t} lang={lang} />
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
              {t.common.loadMore}
            </Link>
            <span className="font-mono text-label uppercase text-faint">
              {fill(t.feed.shownOf, {
                shown: formatCount(result.items.length, lang),
                total: formatCount(result.total, lang),
              })}
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
  t,
  lang,
}: {
  entry: ChangelogEntryView
  kinds: ChangeKind[]
  t: Dictionary
  lang: Locale
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
              <KindBadge kind={change.kind} t={t} />
            </div>
            <p className="text-body leading-relaxed text-ink-2">{change.body}</p>
          </li>
        ))}
      </ul>

      {entry.closedPosts.length > 0 && (
        <p className="mt-5 text-small text-faint">
          {fill(t.changelog.closedPosts, {
            count: formatCount(entry.closedPosts.length, lang),
          })}{' '}
          ·{' '}
          <Link
            href={`/changelog/${entry.slug}`}
            className="underline underline-offset-2 hover:text-ink"
          >
            {t.changelog.whichOnes}
          </Link>
        </p>
      )}
    </article>
  )
}
