'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { formatCount } from '@/core/content'
import { changeKinds } from '@/core/domain/changelog/kinds'
import type { ReleaseChangeView, ReleasePostLink } from '@/queries/types'
import { StatusBadge } from '@/ui/primitives/status-badge'

import {
  addChangeAction,
  linkReleasePostAction,
  removeChangeAction,
  searchReleaseCandidatesAction,
  unlinkReleasePostAction,
} from './actions'

/**
 * Список изменений записи (FR-162).
 *
 * Запись собирается по одному изменению со своим типом у каждого, а не одним
 * текстом: тип нужен фильтру ленты и бейджам, и восстановить его из абзаца
 * markdown потом уже нельзя.
 */
export function ReleaseChanges({
  entryId,
  changes,
  editable,
}: {
  entryId: string
  changes: ReleaseChangeView[]
  editable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)

  const submit = (data: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await addChangeAction(entryId, data)
      if (result.ok) {
        form.current?.reset()
        router.refresh()
        return
      }
      setError(
        result.reason === 'title-required'
          ? 'Нужен заголовок изменения — хотя бы три знака.'
          : 'Не удалось сохранить: запись не найдена или нет прав.',
      )
    })
  }

  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2.5 text-body font-bold text-ink">
        Что изменилось
        <span className="tnum text-small font-normal text-faint">
          {formatCount(changes.length)}
        </span>
      </h2>

      {changes.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-3 text-small text-muted">
          Пока пусто. Запись без изменений выйдет одной вводкой — и не попадёт
          ни под один фильтр ленты по типу.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {changes.map((change) => (
            <li key={change.id} className="px-3 py-2">
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 text-small text-faint">
                  {changeKinds.find((k) => k.key === change.kind)?.name ?? change.kind}
                </span>
                <span className="min-w-0 flex-1 text-small font-semibold text-ink">
                  {change.title}
                </span>
                {editable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await removeChangeAction(entryId, change.id)
                        router.refresh()
                      })
                    }
                    className="shrink-0 rounded-field px-2 py-0.5 text-small text-muted hover:bg-track hover:text-ink disabled:opacity-50"
                  >
                    Убрать
                  </button>
                )}
              </div>
              {change.body && (
                <p className="mt-0.5 text-small text-muted">{change.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form ref={form} action={submit} className="mt-3 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="change-kind" className="sr-only">
              Тип изменения
            </label>
            <select
              id="change-kind"
              name="kind"
              defaultValue="new"
              className="h-8 shrink-0 rounded-field border border-line bg-surface px-2 text-small text-ink-2"
            >
              {changeKinds.map((kind) => (
                <option key={kind.key} value={kind.key}>
                  {kind.name}
                </option>
              ))}
            </select>

            <label htmlFor="change-title" className="sr-only">
              Заголовок изменения
            </label>
            <input
              id="change-title"
              name="title"
              required
              minLength={3}
              placeholder="Что изменилось — одной строкой"
              className="h-8 min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
            />

            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track disabled:opacity-50"
            >
              Добавить
            </button>
          </div>

          <label htmlFor="change-body" className="sr-only">
            Подробности
          </label>
          <textarea
            id="change-body"
            name="body"
            rows={2}
            placeholder="Подробности: что именно стало работать иначе"
            className="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2 placeholder:text-faint"
          />

          {error && <p className="text-small text-ink-2">{error}</p>}
        </form>
      )}
    </section>
  )
}

interface Candidate {
  id: string
  title: string
  boardName: string
  voteCount: number
}

/**
 * Обращения, которые закроет публикация (FR-165).
 *
 * Здесь и решается, кто получит письмо «то, что вы просили, вышло», —
 * поэтому список стоит рядом с текстом релиза, а не прячется за вкладкой.
 */
export function ReleasePosts({
  entryId,
  posts,
  editable,
}: {
  entryId: string
  posts: ReleasePostLink[]
  editable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2.5 text-body font-bold text-ink">
        Закроет обращения
        <span className="tnum text-small font-normal text-faint">
          {formatCount(posts.length)}
        </span>
      </h2>

      {posts.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-3 text-small text-muted">
          Ни одного. Так бывает у технических релизов — тогда публикация
          никому не пишет, а просто выходит в ленту.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {posts.map((post) => (
            <li key={post.slug} className="flex items-center gap-3 px-3 py-2">
              <Link
                href={`/${post.boardSlug}/p/${post.slug}`}
                className="min-w-0 flex-1 truncate text-small font-semibold text-ink hover:underline"
              >
                {post.title}
              </Link>
              <StatusBadge status={post.status} size="sm" />
              <span className="tnum shrink-0 text-small text-muted">
                {formatCount(post.count)}
              </span>
              {editable && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await unlinkReleasePostAction(entryId, post.id)
                      router.refresh()
                    })
                  }
                  className="shrink-0 rounded-field px-2 py-0.5 text-small text-muted hover:bg-track hover:text-ink disabled:opacity-50"
                >
                  Отвязать
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && <PostSearch entryId={entryId} />}
    </section>
  )
}

function PostSearch({ entryId }: { entryId: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [pending, startTransition] = useTransition()
  /* Каждый ввод отменяет предыдущий: медленный ранний ответ не должен
     перезатирать свежий. */
  const attempt = useRef(0)

  useEffect(() => {
    const search = query.trim()
    if (search.length < 2) return

    const mine = ++attempt.current
    const timer = setTimeout(async () => {
      const found = await searchReleaseCandidatesAction(entryId, search)
      if (mine === attempt.current) setResults(found)
    }, 250)

    return () => clearTimeout(timer)
  }, [query, entryId])

  const onQueryChange = (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      attempt.current++
      setResults([])
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor="release-post-search" className="sr-only">
        Найти обращение
      </label>
      <input
        id="release-post-search"
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Привязать обращение: начните вводить заголовок"
        className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
      />

      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-card border border-line bg-surface">
          {results.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await linkReleasePostAction(entryId, candidate.id)
                    setQuery('')
                    setResults([])
                    router.refresh()
                  })
                }
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-track disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate text-small text-ink">
                  {candidate.title}
                </span>
                <span className="shrink-0 text-small text-faint">{candidate.boardName}</span>
                <span className="tnum shrink-0 text-small text-muted">
                  {formatCount(candidate.voteCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
