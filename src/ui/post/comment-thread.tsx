import { formatCount, plural } from '@/core/content'
import { Avatar } from '@/ui/primitives/avatar'
import type { CommentView } from '@/queries/types'

/**
 * Тред обсуждения (FR-136).
 *
 * Вложенность ровно одна: ответ на ответ уходит в тот же уровень. Глубокие
 * ветки в фидбэке никто не читает, а верстать их приходится вечно.
 *
 * Закреплённый ответ команды (FR-138) стоит первым и визуально отделён:
 * это чаще всего единственное, что пользователь пришёл прочитать.
 */
export function CommentThread({ comments }: { comments: CommentView[] }) {
  if (comments.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-body text-muted">
        Обсуждения пока нет. Первый комментарий часто решает, разберётся команда
        в проблеме или нет.
      </p>
    )
  }

  return (
    <ul className="space-y-5">
      {comments.map((comment) => (
        <li key={comment.id}>
          <Comment comment={comment} />
          {comment.replies.length > 0 && (
            <ul className="mt-4 space-y-4 border-l border-line pl-4 sm:pl-6">
              {comment.replies.map((reply) => (
                <li key={reply.id}>
                  <Comment comment={reply} nested />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function Comment({
  comment,
  nested = false,
}: {
  comment: CommentView
  nested?: boolean
}) {
  return (
    <article
      className={
        comment.pinned
          ? 'rounded-card border border-line bg-surface p-4'
          : undefined
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Avatar
          initials={comment.author.initials}
          isTeam={comment.author.isTeam}
          size={nested ? 'sm' : 'md'}
        />
        <span className="text-body font-semibold text-ink">
          {comment.author.name}
        </span>
        {comment.author.isTeam && (
          <span className="rounded-pill bg-ink px-2 py-0.5 text-[11px] font-semibold text-surface">
            команда
          </span>
        )}
        {comment.pinned && (
          <span className="text-[11px] font-semibold text-faint">закреплено</span>
        )}
        <time dateTime={comment.createdAt} className="text-small text-faint">
          {comment.createdLabel}
        </time>
      </div>

      <p className="text-body leading-relaxed text-ink-2">{comment.body}</p>

      <div className="mt-2.5 flex items-center gap-4 text-small text-faint">
        <button type="button" className="hover:text-ink">
          Ответить
        </button>
        {comment.likeCount > 0 && (
          <span className="tnum">
            {formatCount(comment.likeCount)}{' '}
            {plural(comment.likeCount, ['отметка', 'отметки', 'отметок'])}{' '}
            «полезно»
          </span>
        )}
      </div>
    </article>
  )
}
