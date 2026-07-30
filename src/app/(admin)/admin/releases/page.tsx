import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import { formatCount, plural } from '@/core/content'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { PublishButton } from '@/features/releases/publish-button'
import { queries } from '@/queries'
import type { ReleaseAdminView } from '@/queries/types'
import { StatusBadge } from '@/ui/primitives/status-badge'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Релизы', robots: { index: false } }

/**
 * Релизы: та самая точка, где цикл обратной связи замыкается (FR-165).
 *
 * Экран отвечает на один вопрос — что произойдёт с людьми, когда запись
 * выйдет. Поэтому на виду не текст релиза, а список обращений, которые он
 * закроет, и число писем: публикация необратима, а её последствия наступают
 * не на портале, а в чужих почтовых ящиках.
 */
export default async function ReleasesPage() {
  const viewer = await getViewer()
  if (!can(viewer, 'team.view')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Релизы ведёт команда продукта.</p>
      </StateScreen>
    )
  }

  const { pending, published } = await queries.getReleases()
  const mayPublish = can(viewer, 'release.publish')

  return (
    <div className="mx-auto max-w-[62rem] px-4 py-6">
      <h1 className="mb-1 text-h3 font-bold text-ink">Релизы</h1>
      <p className="mb-6 max-w-[70ch] text-small text-muted">
        Публикация закрывает связанные обращения и отправляет их авторам
        и голосовавшим письмо «то, что вы просили, вышло». Это единственная
        рассылка портала с хорошей новостью — и единственное действие, которое
        нельзя отменить.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 flex items-baseline gap-2.5 text-body font-bold text-ink">
          Готовятся
          <span className="tnum text-small font-normal text-faint">
            {formatCount(pending.length)}
          </span>
        </h2>

        {pending.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-8 text-center text-small text-muted">
            Черновиков нет. Запись создаётся вместе с релизом — сидом,
            импортом или скриптом выкладки; здесь она публикуется.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((entry) => (
              <li key={entry.id}>
                <ReleaseCard entry={entry} mayPublish={mayPublish} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-body font-bold text-ink">Вышли</h2>
        {published.length === 0 ? (
          <p className="text-small text-muted">Пока ни одной опубликованной записи.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {published.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
              >
                <Link
                  href={`/changelog/${entry.slug}` as Route}
                  className="text-small font-semibold text-ink hover:underline"
                >
                  {entry.title}
                </Link>
                {entry.version && (
                  <span className="tnum text-small text-muted">{entry.version}</span>
                )}
                <span className="text-small text-faint">
                  {closedLabel(entry.posts.length)}
                </span>
                <span className="ml-auto text-small text-faint">
                  {entry.publishedLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ReleaseCard({
  entry,
  mayPublish,
}: {
  entry: ReleaseAdminView
  mayPublish: boolean
}) {
  return (
    <article className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-body font-bold text-ink">{entry.title}</h3>
        {entry.version && <span className="tnum text-small text-muted">{entry.version}</span>}
        <span className="text-small text-faint">
          {entry.changeCount > 0
            ? `${formatCount(entry.changeCount)} ${plural(entry.changeCount, ['изменение', 'изменения', 'изменений'])}`
            : 'без списка изменений'}
        </span>
        <span className="ml-auto text-small text-faint">
          {/* Срок публикации — обещание, данное вне портала: маркетинг ставит
              дату, и воркер публикует запись сам (FR-166). */}
          {entry.scheduledLabel ? `по сроку ${entry.scheduledLabel}` : 'черновик без срока'}
        </span>
      </div>

      {entry.posts.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-field border border-line">
          {entry.posts.map((post) => (
            <li key={post.slug} className="flex items-center gap-3 px-2.5 py-1.5">
              <Link
                href={`/${post.boardSlug}/p/${post.slug}` as Route}
                className="min-w-0 flex-1 truncate text-small text-ink-2 hover:text-ink"
              >
                {post.title}
              </Link>
              <StatusBadge status={post.status} size="sm" />
              <span className="tnum shrink-0 text-small text-faint">
                {formatCount(post.count)} {plural(post.count, post.countLabel)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mayPublish ? (
        <PublishButton entryId={entry.id} posts={entry.posts.length} letters={entry.letters} />
      ) : (
        <p className="text-small text-faint">
          Публикация — право администратора: письма отозвать нельзя.
        </p>
      )}
    </article>
  )
}

function closedLabel(posts: number): string {
  if (posts === 0) return 'без обращений'
  return `закрыл ${formatCount(posts)} ${plural(posts, ['обращение', 'обращения', 'обращений'])}`
}
