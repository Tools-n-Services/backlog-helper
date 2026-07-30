import {
  formatCount,
  pickTranslation,
  plural,
  sourceLanguage,
  type Dictionary,
  type Locale,
} from '@/core/content'
import {
  TranslatedParagraphs,
  TranslationNotice,
  TranslationScope,
} from '@/features/post/translation'
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
 *
 * Каждый комментарий переключается между переводом и оригиналом отдельно:
 * в треде на двух языках часть реплик уже на языке читателя, и общий
 * переключатель на весь тред означал бы «переведи то, что и так понятно».
 */
export function CommentThread({
  comments,
  t,
  lang,
}: {
  comments: CommentView[]
  t: Dictionary
  lang: Locale
}) {
  if (comments.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-body text-muted">
        {t.post.emptyThread}
      </p>
    )
  }

  return (
    <ul className="space-y-5">
      {comments.map((comment) => (
        <li key={comment.id}>
          <Comment comment={comment} t={t} lang={lang} />
          {comment.replies.length > 0 && (
            <ul className="mt-4 space-y-4 border-l border-line pl-4 sm:pl-6">
              {comment.replies.map((reply) => (
                <li key={reply.id}>
                  <Comment comment={reply} t={t} lang={lang} nested />
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
  t,
  lang,
  nested = false,
}: {
  comment: CommentView
  t: Dictionary
  lang: Locale
  nested?: boolean
}) {
  const translation = pickTranslation(comment.translations, lang, comment.sourceLocale)

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
            {t.post.teamMark}
          </span>
        )}
        {comment.pinned && (
          <span className="text-[11px] font-semibold text-faint">
            {t.post.pinnedMark}
          </span>
        )}
        <time dateTime={comment.createdAt} className="text-small text-faint">
          {comment.createdLabel}
        </time>
      </div>

      <TranslationScope available={translation !== null}>
        <TranslatedParagraphs
          itemClassName="whitespace-pre-line text-body leading-relaxed text-ink-2"
          original={[comment.body]}
          translation={translation?.body ?? null}
        />
        <TranslationNotice
          className="mt-1.5"
          from={t.post.translatedFrom[sourceLanguage(comment.sourceLocale)]}
          showOriginal={t.post.showOriginal}
          showTranslation={t.post.showTranslation}
        />
      </TranslationScope>

      <div className="mt-2.5 flex items-center gap-4 text-small text-faint">
        <button type="button" className="hover:text-ink">
          {t.post.reply}
        </button>
        {comment.likeCount > 0 && (
          <span className="tnum">
            {formatCount(comment.likeCount, lang)}{' '}
            {plural(comment.likeCount, t.post.helpfulForms, lang)}
          </span>
        )}
      </div>
    </article>
  )
}
