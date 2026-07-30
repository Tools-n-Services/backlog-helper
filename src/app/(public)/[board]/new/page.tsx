import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { catalog, loadCatalog } from '@/core/catalog'
import { fill, localized, type Dictionary, type Locale } from '@/core/content'
import { content, locale } from '@/core/locale'
import { getViewer } from '@/core/session'
import { translationReady } from '@/core/translate'
import { PostForm } from '@/features/intake/post-form'
import { queries } from '@/queries'
import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await content()
  return { title: t.intake.newPost }
}

/**
 * Создание обращения в два шага.
 *
 * Первый шаг — выбор типа (FR-120), и он не декоративный: от типа зависят
 * поля формы, набор статусов и видимость. Спрашивать это после того, как
 * человек написал текст, поздно.
 */
export default async function NewPostPage({
  params,
  searchParams,
}: PageProps<'/[board]/new'>) {
  const { board: boardSlug } = await params
  const { type: typeParam } = await searchParams

  const [board, viewer, t, lang] = await Promise.all([
    queries.getBoard(boardSlug),
    getViewer(),
    content(),
    locale(),
    /* Типы обращений приходят из справочника: их состав правится в админке,
       а не выкладкой (В1, docs/09-install.md). */
    loadCatalog(),
  ])
  if (!board || board.visibility !== 'public') notFound()

  const boardName = localized(board.name, board.nameEn, lang)

  /* Блокировка объясняется причиной и путём обжалования: «недостаточно прав»
     без объяснения — самый быстрый способ получить жалобу вместо диалога. */
  if (viewer.banned) {
    return (
      <StateScreen
        title={t.intake.bannedTitleScreen}
        actions={
          <>
            <PrimaryAction href="/">{t.intake.bannedAppeal}</PrimaryAction>
            <SecondaryAction href={`/${board.slug}`}>
              {t.auth.readPosts}
            </SecondaryAction>
          </>
        }
        note={t.intake.bannedNote}
      >
        <p>{fill(t.intake.bannedReason, { reason: viewer.bannedReason ?? '' })}</p>
        <p>{t.intake.bannedRead}</p>
      </StateScreen>
    )
  }

  if (!viewer.signedIn) {
    return (
      <StateScreen
        title={t.intake.signInTitleScreen}
        actions={
          <>
            <PrimaryAction href="/login">{t.nav.signIn}</PrimaryAction>
            <SecondaryAction href={`/${board.slug}`}>
              {t.auth.readPosts}
            </SecondaryAction>
          </>
        }
      >
        <p>{t.intake.signInLeadScreen}</p>
      </StateScreen>
    )
  }

  const typeKey = Array.isArray(typeParam) ? typeParam[0] : typeParam
  const type = typeKey ? catalog().typeByKey.get(typeKey) : undefined
  const onForm = Boolean(type?.enabled)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-10 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[46rem]">
        <nav
          aria-label={t.common.breadcrumbs}
          className="mb-6 flex items-center gap-2 text-small text-faint"
        >
          <Link href={`/${board.slug}`} className="hover:text-ink">
            {boardName}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink-2">{t.intake.newPost}</span>
        </nav>

        <p className="font-mono text-label uppercase text-faint">
          {fill(t.intake.step, { step: onForm ? 2 : 1 })}
        </p>

        {type && onForm ? (
          <>
            <h1 className="mt-4 text-h1 font-light text-ink">
              {t.intake.tell}{' '}
              <span className="font-extrabold">
                {localized(type.prompt, type.promptEn, lang)}
              </span>
            </h1>
            <p className="mb-8 mt-4 flex flex-wrap items-center gap-2 text-small text-faint">
              <span className="rounded-pill bg-track px-2.5 py-1 font-semibold text-ink-2">
                {localized(type.name, type.nameEn, lang)}
              </span>
              <Link
                href={`/${board.slug}/new`}
                className="underline underline-offset-2 hover:text-ink"
              >
                {t.intake.changeTypeShort}
              </Link>
            </p>
            <PostForm
              board={board}
              type={type}
              t={t}
              lang={lang}
              /* Обещание автоперевода даётся только когда переводчик
                 действительно включён: невыполненное обещание хуже молчания. */
              translating={translationReady().ok}
            />
          </>
        ) : (
          <TypeChooser boardSlug={board.slug} boardName={boardName} t={t} lang={lang} />
        )}
      </div>
    </div>
  )
}

function TypeChooser({
  boardSlug,
  boardName,
  t,
  lang,
}: {
  boardSlug: string
  boardName: string
  t: Dictionary
  lang: Locale
}) {
  return (
    <>
      <h1 className="mt-4 text-h1 font-light text-ink">
        {t.intake.chooserTitleLight}{' '}
        <span className="font-extrabold">{t.intake.chooserTitleBold}</span>
      </h1>
      <p className="mt-4 max-w-[52ch] text-body-l text-muted">{t.intake.chooserLead}</p>

      <ul className="mt-8 space-y-3">
        {catalog().enabledTypes.map((type) => (
          <li key={type.key}>
            <Link
              href={`/${boardSlug}/new?type=${type.key}`}
              className="flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-shadow hover:shadow-flat"
            >
              <span className="text-h3 font-bold text-ink">
                {localized(type.chooserTitle, type.chooserTitleEn, lang)}
              </span>
              <span className="mt-2 text-body text-muted">
                {localized(type.description, type.descriptionEn, lang)}
              </span>
              <span className="mt-3 font-mono text-label uppercase text-faint">
                {localized(type.name, type.nameEn, lang).toLowerCase()} ·{' '}
                {type.allowsVotes ? t.intake.withVotes : t.intake.withoutVotes}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-small text-faint">
        {t.intake.boardLabel} <span className="text-ink-2">{boardName}</span>
      </p>
    </>
  )
}
