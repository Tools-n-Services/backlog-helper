import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { enabledPostTypes, postTypeByKey } from '@config/post-types'
import { getViewer } from '@/core/session'
import { PostForm } from '@/features/intake/post-form'
import { queries } from '@/queries'
import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Новое обращение' }

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

  const board = await queries.getBoard(boardSlug)
  if (!board || board.visibility !== 'public') notFound()

  const viewer = await getViewer()

  /* Блокировка объясняется причиной и путём обжалования: «недостаточно прав»
     без объяснения — самый быстрый способ получить жалобу вместо диалога. */
  if (viewer.banned) {
    return (
      <StateScreen
        title="Аккаунт заблокирован"
        actions={
          <>
            <PrimaryAction href="/">Оспорить блокировку</PrimaryAction>
            <SecondaryAction href={`/${board.slug}`}>Читать обращения</SecondaryAction>
          </>
        }
        note="Блокировка снимается вручную. Разберёмся за один рабочий день."
      >
        <p>Причина: {viewer.bannedReason}.</p>
        <p>
          Читать портал можно. Создавать обращения, голосовать и комментировать —
          нет.
        </p>
      </StateScreen>
    )
  }

  if (!viewer.signedIn) {
    return (
      <StateScreen
        title="Создавать обращения можно после входа"
        actions={
          <>
            <PrimaryAction href="/login">Войти</PrimaryAction>
            <SecondaryAction href={`/${board.slug}`}>Читать обращения</SecondaryAction>
          </>
        }
      >
        <p>
          Вход по ссылке из письма, пароль не нужен. Читать портал и искать
          похожие обращения можно и без него.
        </p>
      </StateScreen>
    )
  }

  const typeKey = Array.isArray(typeParam) ? typeParam[0] : typeParam
  const type = typeKey ? postTypeByKey.get(typeKey) : undefined
  const onForm = Boolean(type?.enabled)

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-10 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[46rem]">
        <nav
          aria-label="Хлебные крошки"
          className="mb-6 flex items-center gap-2 text-small text-faint"
        >
          <Link href={`/${board.slug}`} className="hover:text-ink">
            {board.name}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink-2">Новое обращение</span>
        </nav>

        <p className="font-mono text-label uppercase text-faint">
          Шаг {onForm ? 2 : 1} из 2
        </p>

        {type && onForm ? (
          <>
            <h1 className="mt-4 text-h1 font-light text-ink">
              Расскажите,{' '}
              <span className="font-extrabold">{promptFor(type.key)}</span>
            </h1>
            <p className="mb-8 mt-4 flex flex-wrap items-center gap-2 text-small text-faint">
              <span className="rounded-pill bg-track px-2.5 py-1 font-semibold text-ink-2">
                {type.name}
              </span>
              <Link
                href={`/${board.slug}/new`}
                className="underline underline-offset-2 hover:text-ink"
              >
                сменить
              </Link>
            </p>
            <PostForm board={board} type={type} />
          </>
        ) : (
          <TypeChooser boardSlug={board.slug} boardName={board.name} />
        )}
      </div>
    </div>
  )
}

/** Продолжение заголовка второго шага. Переедет в content/ вместе с i18n. */
function promptFor(typeKey: string): string {
  switch (typeKey) {
    case 'bug':
      return 'что сломалось'
    case 'question':
      return 'что не получается'
    default:
      return 'что предлагаете'
  }
}

function TypeChooser({
  boardSlug,
  boardName,
}: {
  boardSlug: string
  boardName: string
}) {
  return (
    <>
      <h1 className="mt-4 text-h1 font-light text-ink">
        С чем вы <span className="font-extrabold">пришли</span>
      </h1>
      <p className="mt-4 max-w-[52ch] text-body-l text-muted">
        От типа зависят вопросы в форме: для бага нужны шаги воспроизведения,
        для идеи — задача, которую она решает.
      </p>

      <ul className="mt-8 space-y-3">
        {enabledPostTypes.map((type) => (
          <li key={type.key}>
            <Link
              href={`/${boardSlug}/new?type=${type.key}`}
              className="flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-shadow hover:shadow-flat"
            >
              <span className="text-h3 font-bold text-ink">
                {chooserTitle(type.key)}
              </span>
              <span className="mt-2 text-body text-muted">{type.description}</span>
              <span className="mt-3 font-mono text-label uppercase text-faint">
                {type.name.toLowerCase()} ·{' '}
                {type.allowsVotes ? 'с голосованием' : 'без голосования'}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-small text-faint">
        Доска: <span className="text-ink-2">{boardName}</span>
      </p>
    </>
  )
}

function chooserTitle(typeKey: string): string {
  switch (typeKey) {
    case 'bug':
      return 'Что-то работает не так'
    case 'question':
      return 'Не понимаю, как сделать'
    default:
      return 'Хочу предложить идею'
  }
}
