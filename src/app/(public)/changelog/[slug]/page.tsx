import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { product } from '@config/product'
import { formatCount, plural } from '@/core/content'
import { queries } from '@/queries'
import { KindBadge } from '@/ui/changelog/kind-badge'
import { StatusBadge } from '@/ui/primitives/status-badge'

export async function generateMetadata({
  params,
}: PageProps<'/changelog/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const entry = await queries.getChangelogEntry(slug)
  if (!entry) return {}
  return {
    title: entry.title,
    description: entry.lead,
    alternates: { canonical: `/changelog/${slug}` },
    openGraph: { type: 'article', title: entry.title, description: entry.lead },
  }
}

/**
 * Страница релиза со связанными обращениями (FR-165).
 *
 * Ради этого блока портал и существует: человек видит, что его запрос не
 * растворился, а вышел. Здесь цикл обратной связи замыкается.
 */
export default async function ChangelogEntryPage({
  params,
}: PageProps<'/changelog/[slug]'>) {
  if (!product.features.changelog) notFound()

  const { slug } = await params
  const entry = await queries.getChangelogEntry(slug)
  if (!entry) notFound()

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-10 md:px-8 lg:px-10">
      <article className="mx-auto max-w-[46rem]">
        <nav
          aria-label="Хлебные крошки"
          className="mb-6 flex items-center gap-2 text-small text-faint"
        >
          <Link href="/changelog" className="hover:text-ink">
            Что нового
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink-2">
            {entry.version ? `Релиз ${entry.version}` : entry.title}
          </span>
        </nav>

        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {entry.version && (
            <span className="font-mono text-h3 font-semibold text-ink">
              {entry.version}
            </span>
          )}
          <time dateTime={entry.publishedAt} className="text-small text-faint">
            {entry.publishedLabel}
          </time>
          {entry.labels.map((label) => (
            <span key={label} className="text-small text-faint">
              · {label}
            </span>
          ))}
        </div>

        <h1 className="text-h1 font-extrabold tracking-tight text-ink">
          {entry.title}
        </h1>

        <p className="mt-5 text-body-l leading-relaxed text-muted">{entry.lead}</p>

        <div className="mt-10 space-y-9">
          {entry.changes.map((change, i) => (
            <section key={i}>
              <KindBadge kind={change.kind} />
              <h2 className="mt-3 text-h3 font-bold text-ink">{change.title}</h2>
              <p className="mt-2 text-body-l leading-relaxed text-ink-2">
                {change.body}
              </p>
            </section>
          ))}
        </div>

        {entry.closedPosts.length > 0 && (
          <section className="mt-12 border-t border-line pt-6">
            <h2 className="mb-4 font-mono text-label uppercase text-faint">
              Закрытые обращения
            </h2>
            <ul className="space-y-3">
              {entry.closedPosts.map((post) => (
                <li
                  key={`${post.boardSlug}/${post.slug}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
                >
                  <Link
                    href={`/${post.boardSlug}/p/${post.slug}`}
                    className="min-w-0 text-body font-semibold text-ink hover:text-ink-hover"
                  >
                    {post.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={post.status} size="sm" />
                    <span className="tnum text-small text-faint">
                      {formatCount(post.count)} {plural(post.count, post.countLabel)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-small text-faint">
              Все, кто голосовал за эти обращения, получили письмо о выходе.
            </p>
          </section>
        )}
      </article>
    </div>
  )
}
