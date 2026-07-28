import Link from 'next/link'

import { formatCount, plural } from '@/core/content'
import { Chip } from '@/ui/primitives/chip'
import { StatusBadge } from '@/ui/primitives/status-badge'
import { VoteControl } from '@/features/post/vote-control'
import type { PostCardView } from '@/queries/types'

/**
 * Карточка обращения в ленте (FR-118): счётчик и кнопка голоса, тип, статус,
 * категория, счётчик комментариев, признак приватности и закрепления.
 * Голосовать можно прямо из ленты, без перехода в обращение.
 */
export function PostCard({
  post,
  signedIn,
}: {
  post: PostCardView
  signedIn: boolean
}) {
  return (
    <article className="flex gap-4 rounded-card border border-line bg-surface p-4 transition-shadow hover:shadow-flat">
      <VoteControl
        postId={post.id}
        count={post.count}
        type={post.type}
        voted={post.voted}
        signedIn={signedIn}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Chip>{post.type.name}</Chip>
          <StatusBadge status={post.status} size="sm" />
          {post.categoryName && (
            <Chip href={`/${post.boardSlug}?category=${post.categorySlug}`} tone="quiet">
              {post.categoryName}
            </Chip>
          )}
          {post.pinned && (
            <span className="text-[11px] font-semibold text-faint">закреплено</span>
          )}
          {/* Видно только автору в его профиле: в ленте таких обращений нет.
              Без этой пометки отправленное обращение выглядит пропавшим. */}
          {post.pendingModeration && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'var(--color-signal-pending)' }}
            >
              на проверке
            </span>
          )}
          {post.privacy !== 'public' && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'var(--color-signal-private)' }}
            >
              только участники
            </span>
          )}
        </div>

        <h3 className="text-h3 font-bold tracking-tight text-ink">
          <Link
            href={`/${post.boardSlug}/p/${post.slug}`}
            className="hover:text-ink-hover"
          >
            {post.title}
          </Link>
        </h3>

        <p className="mt-1.5 line-clamp-2 text-body text-muted">{post.excerpt}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-faint">
          {post.commentCount > 0 && (
            <span className="tnum">
              {formatCount(post.commentCount)}{' '}
              {plural(post.commentCount, ['комментарий', 'комментария', 'комментариев'])}
            </span>
          )}
          <span>
            обновлено <time dateTime={post.updatedAt}>{post.updatedLabel}</time>
          </span>
          {post.awaitingReporter ? (
            <span style={{ color: 'var(--color-status-needs-info-fg)' }}>
              ждёт ответа автора
            </span>
          ) : (
            post.hasTeamReply && <span className="text-muted">ответ команды</span>
          )}
        </div>
      </div>
    </article>
  )
}
