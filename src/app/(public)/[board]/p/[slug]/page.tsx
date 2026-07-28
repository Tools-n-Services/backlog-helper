import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatCount, plural } from '@/core/content'
import { can } from '@/core/permissions'
import { canContribute, getViewer } from '@/core/session'
import { submitCommentForm } from '@/features/post/actions'
import { PostActions } from '@/features/post/post-actions'
import { VoteControl } from '@/features/post/vote-control'
import { queries } from '@/queries'
import { CommentThread } from '@/ui/post/comment-thread'
import { MergedPosts, StatusHistory, Voters } from '@/ui/post/post-aside'
import { Avatar } from '@/ui/primitives/avatar'
import { Chip } from '@/ui/primitives/chip'
import { StatusBadge } from '@/ui/primitives/status-badge'
import type { BacklogLinkView, PostMergedView } from '@/queries/types'

export async function generateMetadata({
  params,
}: PageProps<'/[board]/p/[slug]'>): Promise<Metadata> {
  const { board, slug } = await params
  const result = await queries.getPost(board, slug)
  if (!result) return {}
  if (result.kind === 'merged') {
    return { title: result.title, robots: { index: false } }
  }
  const isPublic = result.privacy === 'public'
  return {
    title: result.title,
    description: result.details[0],
    /* Приватные обращения не индексируются (FR-564). */
    robots: isPublic ? undefined : { index: false },
    alternates: { canonical: `/${board}/p/${slug}` },
    openGraph: isPublic
      ? {
          type: 'article',
          title: result.title,
          /* Счётчик и статус прямо в превью: по ссылке из чата видно,
             сколько людей это просят и на какой оно стадии (FR-143). */
          description: `${formatCount(result.count)} ${plural(result.count, result.type.countLabel)} · ${result.status.name} — ${result.details[0]}`,
        }
      : undefined,
  }
}

export default async function PostPage({ params }: PageProps<'/[board]/p/[slug]'>) {
  const { board: boardSlug, slug } = await params
  const viewer = await getViewer()
  const [board, result] = await Promise.all([
    queries.getBoard(boardSlug),
    queries.getPost(boardSlug, slug, viewer.signedIn ? viewer.id : undefined),
  ])
  if (!board || !result) notFound()

  if (result.kind === 'merged') return <MergedNotice result={result} />

  const post = result

  /* Внутренняя часть — только команде: формулировки в бэклоге свои,
     и показывать их автору обращения незачем и вредно. */
  const backlogLinks = can(viewer, 'triage.decide')
    ? await queries.getBacklogLinksForPost(post.id)
    : []

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-8 md:px-8 lg:px-10">
      <nav
        aria-label="Хлебные крошки"
        className="mb-6 flex flex-wrap items-center gap-2 text-small text-faint"
      >
        <Link href="/" className="hover:text-ink">
          Все доски
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/${board.slug}`} className="hover:text-ink">
          {board.name}
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-ink-2">{post.ref}</span>
      </nav>

      <BacklogStrip links={backlogLinks} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="flex gap-5">
            <VoteControl
              postId={post.id}
              count={post.count}
              type={post.type}
              voted={post.voted}
              signedIn={canContribute(viewer)}
              variant="page"
            />

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip>{post.type.name}</Chip>
                <StatusBadge status={post.status} />
                {post.categoryName && (
                  <Chip
                    href={`/${post.boardSlug}?category=${post.categorySlug}`}
                    tone="quiet"
                  >
                    {post.categoryName}
                  </Chip>
                )}
                <span className="text-small text-faint">
                  создано <time dateTime={post.createdAt}>{post.createdLabel}</time>
                </span>
              </div>

              <h1 className="text-h2 font-extrabold tracking-tight text-ink">
                {post.title}
              </h1>

              {post.eta && (
                <p className="mt-2 text-small text-muted">
                  Ожидаем выпустить: <span className="text-ink-2">{post.eta}</span>
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {post.details.map((paragraph, i) => (
              <p key={i} className="text-body-l leading-relaxed text-ink-2">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            <div className="flex items-center gap-3">
              <Avatar initials={post.author.initials} />
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{post.author.name}</p>
                <p className="text-small text-faint">{post.author.role}</p>
              </div>
            </div>
            <PostActions
              postId={post.id}
              subscribed={post.subscribed}
              signedIn={canContribute(viewer)}
            />
          </div>

          <section className="mt-10">
            <h2 className="mb-5 flex items-baseline gap-2.5 text-h3 font-bold text-ink">
              Обсуждение
              <span className="tnum text-body font-normal text-faint">
                {formatCount(post.commentCount)}
              </span>
            </h2>

            {viewer.signedIn ? (
              /* Обычная форма с серверным действием, без клиентского
                 состояния: тред рендерится на сервере, и после отправки
                 страницу всё равно нужно перечитать. */
              <form
                action={submitCommentForm.bind(null, post.id, board.slug, slug)}
                className="mb-8 flex items-start gap-3"
              >
                <Avatar initials={viewer.initials} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="comment" className="sr-only">
                    Комментарий
                  </label>
                  <textarea
                    id="comment"
                    name="body"
                    rows={3}
                    required
                    minLength={2}
                    placeholder="Добавьте детали, которые помогут разобраться"
                    className="w-full resize-y rounded-field border border-line bg-surface px-3.5 py-2.5 text-body text-ink-2 placeholder:text-faint"
                  />
                  <button
                    type="submit"
                    className="mt-2 rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
                  >
                    Отправить
                  </button>
                </div>
              </form>
            ) : (
              <p className="mb-8 rounded-card border border-line bg-surface px-4 py-3 text-body text-muted">
                <Link href="/login" className="font-semibold text-ink underline">
                  Войдите
                </Link>
                , чтобы участвовать в обсуждении.
              </p>
            )}

            <CommentThread comments={post.comments} />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <StatusHistory history={post.statusHistory} />
          <Voters
            voters={post.voters}
            total={post.votersTotal}
            hidden={post.votersHidden}
            countLabel={post.type.countLabel}
          />
          <MergedPosts merged={post.merged} boardSlug={post.boardSlug} />
        </aside>
      </div>
    </div>
  )
}

/**
 * В какую работу попало обращение (FR-602).
 *
 * Полосу видит только команда. Она отвечает на вопрос, который иначе
 * требует открыть бэклог и поискать: этим уже кто-то занимается или нет.
 * Работ может быть несколько — «выгрузка в Excel» это и экспорт, и права.
 */
function BacklogStrip({ links }: { links: BacklogLinkView[] }) {
  if (links.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-dashed border-line px-3.5 py-2">
      <span className="font-mono text-label uppercase text-faint">В работе</span>
      {links.map((link) => (
        <Link
          key={link.id}
          href={`/admin/backlog/${link.id}` as Route}
          className="text-small font-semibold text-ink hover:underline"
        >
          {link.title}
          <span className="ml-1.5 font-normal text-muted">
            {link.statusName ?? link.kindName}
          </span>
        </Link>
      ))}
    </div>
  )
}

/**
 * Обращение смержено. Молчаливый редирект здесь недопустим: человек пришёл
 * по своей ссылке и должен понять, что его запрос не удалили, а объединили
 * (07-ui-brief.md, раздел 5).
 *
 * Отдельный вопрос — 301 для поисковиков и старых писем (FR-212): он появится
 * настоящим редиректом, а здесь важен именно видимый экран с объяснением.
 */
function MergedNotice({ result }: { result: PostMergedView }) {
  return (
    <div className="mx-auto max-w-page px-5 py-20 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[56ch] text-center">
        <p className="font-mono text-label uppercase text-faint">
          Обращение объединено
        </p>
        <h1 className="mt-4 text-h2 font-extrabold tracking-tight text-ink">
          {result.title}
        </h1>
        <p className="mt-4 text-body-l text-muted">
          Мы объединили это обращение с другим — о том же самом писали несколько
          человек. Голоса и комментарии перенесены, следить за работой нужно там.
        </p>
        <Link
          href={`/${result.target.boardSlug}/p/${result.target.slug}`}
          className="mt-7 inline-block rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
        >
          Перейти к обращению
        </Link>
        <p className="mt-3 text-small text-faint">{result.target.title}</p>
      </div>
    </div>
  )
}
