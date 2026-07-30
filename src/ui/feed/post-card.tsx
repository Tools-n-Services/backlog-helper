import Link from 'next/link'

import {
  formatCount,
  localized,
  pickTranslation,
  plural,
  sourceLanguage,
  type Dictionary,
  type Locale,
} from '@/core/content'
import { Chip } from '@/ui/primitives/chip'
import { StatusBadge } from '@/ui/primitives/status-badge'
import {
  TranslatedLine,
  TranslatedParagraphs,
  TranslationNotice,
  TranslationScope,
} from '@/features/post/translation'
import { VoteControl } from '@/features/post/vote-control'
import type { PostCardView } from '@/queries/types'

/**
 * Карточка обращения в ленте (FR-118): счётчик и кнопка голоса, тип, статус,
 * категория, счётчик комментариев, признак приватности и закрепления.
 * Голосовать можно прямо из ленты, без перехода в обращение.
 *
 * Заголовок и выжимка показываются на языке смотрящего, если перевод готов
 * (FR-181): лента на двух языках вперемешку — это лента, которую не читают.
 */
export function PostCard({
  post,
  signedIn,
  t,
  lang,
}: {
  post: PostCardView
  signedIn: boolean
  t: Dictionary
  lang: Locale
}) {
  const translation = pickTranslation(post.translations, lang, post.sourceLocale)

  return (
    <article className="flex gap-4 rounded-card border border-line bg-surface p-4 transition-shadow hover:shadow-flat">
      <VoteControl
        postId={post.id}
        count={post.count}
        type={post.type}
        voted={post.voted}
        signedIn={signedIn}
        lang={lang}
        labels={{
          noVotes: t.feed.noVotes,
          youVoted: t.feed.youVoted,
          aria: t.feed.voteAria,
          ariaSignIn: t.feed.voteAriaSignIn,
        }}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Chip>{localized(post.type.name, post.type.nameEn, lang)}</Chip>
          <StatusBadge status={post.status} size="sm" lang={lang} />
          {post.categoryName && (
            <Chip href={`/${post.boardSlug}?category=${post.categorySlug}`} tone="quiet">
              {post.categoryName}
            </Chip>
          )}
          {post.pinned && (
            <span className="text-[11px] font-semibold text-faint">{t.feed.pinned}</span>
          )}
          {/* Видно только автору в его профиле: в ленте таких обращений нет.
              Без этой пометки отправленное обращение выглядит пропавшим. */}
          {post.pendingModeration && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'var(--color-signal-pending)' }}
            >
              {t.feed.pendingModeration}
            </span>
          )}
          {post.privacy !== 'public' && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'var(--color-signal-private)' }}
            >
              {t.feed.membersOnly}
            </span>
          )}
        </div>

        <TranslationScope available={translation !== null}>
          <h3 className="text-h3 font-bold tracking-tight text-ink">
            <Link
              href={`/${post.boardSlug}/p/${post.slug}`}
              className="hover:text-ink-hover"
            >
              <TranslatedLine
                original={post.title}
                translation={translation?.title ?? null}
              />
            </Link>
          </h3>

          <TranslatedParagraphs
            className="mt-1.5"
            itemClassName="line-clamp-2 text-body text-muted"
            original={[post.excerpt]}
            translation={translation?.body ?? null}
          />

          <TranslationNotice
            className="mt-1.5"
            from={t.post.translatedFrom[sourceLanguage(post.sourceLocale)]}
            showOriginal={t.post.showOriginal}
            showTranslation={t.post.showTranslation}
          />
        </TranslationScope>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-faint">
          {post.commentCount > 0 && (
            <span className="tnum">
              {formatCount(post.commentCount, lang)}{' '}
              {plural(post.commentCount, t.common.commentForms, lang)}
            </span>
          )}
          <span>
            {t.feed.updated} <time dateTime={post.updatedAt}>{post.updatedLabel}</time>
          </span>
          {post.awaitingReporter ? (
            <span style={{ color: 'var(--color-status-needs-info-fg)' }}>
              {t.feed.awaitingReporter}
            </span>
          ) : (
            post.hasTeamReply && <span className="text-muted">{t.feed.teamReplied}</span>
          )}
        </div>
      </div>
    </article>
  )
}
