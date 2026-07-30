import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatCount, plural } from '@/core/content'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import {
  deleteReleaseAction,
  updateReleaseAction,
} from '@/features/releases/actions'
import { PublishButton } from '@/features/releases/publish-button'
import { ReleaseChanges, ReleasePosts } from '@/features/releases/release-editor'
import { ReleaseFields } from '@/features/releases/release-fields'
import { queries } from '@/queries'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export async function generateMetadata({
  params,
}: PageProps<'/admin/releases/[id]'>): Promise<Metadata> {
  const { id } = await params
  const entry = await queries.getRelease(id)
  return { title: entry?.title ?? 'Релиз', robots: { index: false } }
}

/**
 * Карточка релиза: текст, изменения, обращения и публикация.
 *
 * Порядок на экране повторяет порядок решения. Сначала — что вышло,
 * потом — кого это касается, и только в конце кнопка, после которой
 * сто человек получат письмо и отозвать его будет нельзя.
 */
export default async function ReleasePage({ params }: PageProps<'/admin/releases/[id]'>) {
  const viewer = await getViewer()
  if (!can(viewer, 'triage.decide')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Релизы ведёт команда продукта.</p>
      </StateScreen>
    )
  }

  const { id } = await params
  const entry = await queries.getRelease(id)
  if (!entry) notFound()

  const mayPublish = can(viewer, 'release.publish')

  return (
    <div className="mx-auto max-w-page px-4 py-6">
      <nav className="mb-3 text-small text-faint">
        <Link href="/admin/releases" className="hover:text-ink">
          Релизы
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h3 font-bold text-ink">{entry.title}</h1>
        {entry.version && <span className="tnum text-small text-muted">{entry.version}</span>}
        <span className="text-small text-faint">
          {entry.published
            ? `вышел ${entry.publishedLabel}`
            : entry.scheduledLabel
              ? `выйдет ${entry.scheduledLabel}`
              : 'черновик без срока'}
        </span>
        {entry.published && (
          <Link
            href={`/changelog/${entry.slug}` as Route}
            className="ml-auto text-small text-muted hover:text-ink"
          >
            Открыть на портале →
          </Link>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <ReleaseChanges
            entryId={entry.id}
            changes={entry.changes}
            editable={!entry.published}
          />
          <ReleasePosts
            entryId={entry.id}
            posts={entry.posts}
            editable={!entry.published}
          />
        </div>

        <aside className="lg:sticky lg:top-16 lg:self-start">
          <h2 className="mb-3 text-body font-bold text-ink">Запись</h2>
          <form action={updateReleaseAction.bind(null, entry.id)}>
            <ReleaseFields entry={entry} />
            <button
              type="submit"
              className="mt-4 w-full rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface hover:bg-ink-hover"
            >
              Сохранить
            </button>
          </form>

          {entry.published ? (
            <p className="mt-4 text-small text-faint">
              {/* Опубликованное не редактируется по составу: письма о выпуске
                  уже ушли, и менять список закрытых обращений задним числом
                  значит расходиться с тем, что человек прочитал в письме. */}
              Запись вышла: {closedLine(entry.posts.length)}. Состав изменений
              и обращений больше не правится — письма уже ушли.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {mayPublish ? (
                <PublishButton
                  entryId={entry.id}
                  posts={entry.posts.length}
                  letters={entry.letters}
                />
              ) : (
                <p className="text-small text-faint">
                  Публикация — право администратора: письма отозвать нельзя.
                </p>
              )}

              <form action={deleteReleaseAction.bind(null, entry.id)}>
                <button
                  type="submit"
                  className="text-small text-muted hover:text-ink"
                  /* Удаление доступно только черновику: у вышедшей записи
                     есть адрес, по которому ходят из писем. */
                >
                  Удалить черновик
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function closedLine(posts: number): string {
  if (posts === 0) return 'обращений к ней не привязано'
  return `закрыла ${formatCount(posts)} ${plural(posts, ['обращение', 'обращения', 'обращений'])}`
}
