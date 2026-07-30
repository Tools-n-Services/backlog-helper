'use client'

import { useState, useTransition } from 'react'

import { formatCount, plural } from '@/core/content'

import { publishReleaseAction } from './actions'

/**
 * Публикация в два нажатия.
 *
 * Одного мало не из-за страха ошибки в целом, а из-за конкретного следствия:
 * нажатие рассылает письма людям, которые голосовали, и отозвать их нельзя.
 * Подтверждение называет число адресатов и число обращений — ровно то, что
 * человек должен знать до нажатия, а не узнать после.
 */
export function PublishButton({
  entryId,
  posts,
  letters,
}: {
  entryId: string
  posts: number
  letters: number
}) {
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const publish = () => {
    setAsked(false)
    setError(null)
    startTransition(async () => {
      const result = await publishReleaseAction(entryId)
      if (!result.ok) setError(messageFor(result.reason))
    })
  }

  if (!asked) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsked(true)}
          className="shrink-0 rounded-pill bg-ink px-4 py-1.5 text-small font-semibold text-surface hover:bg-ink-hover disabled:opacity-50"
        >
          {pending ? 'Публикуем…' : 'Опубликовать'}
        </button>
        {error && <span className="text-small text-ink-2">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-small text-ink-2">
        {consequence(posts, letters)} Отменить нельзя.
      </span>
      <button
        type="button"
        onClick={publish}
        className="shrink-0 rounded-pill bg-ink px-4 py-1.5 text-small font-semibold text-surface hover:bg-ink-hover"
      >
        Публикую
      </button>
      <button
        type="button"
        onClick={() => setAsked(false)}
        className="shrink-0 text-small text-muted hover:text-ink"
      >
        Отмена
      </button>
    </div>
  )
}

/** Что именно произойдёт. Числами, а не словом «уведомления». */
function consequence(posts: number, letters: number): string {
  if (posts === 0) {
    return 'Запись выйдет на портал. Обращений к ней не привязано — письма не уйдут.'
  }
  const postsPart = `${formatCount(posts)} ${plural(posts, ['обращение', 'обращения', 'обращений'])}`
  const lettersPart = `${formatCount(letters)} ${plural(letters, ['письмо', 'письма', 'писем'])}`
  return `Закроется ${postsPart}, уйдёт до ${lettersPart}.`
}

function messageFor(reason: string): string {
  switch (reason) {
    case 'forbidden':
      return 'Публикация — право администратора.'
    case 'already-published':
      return 'Запись уже опубликована: письма ушли один раз.'
    case 'status-missing':
      return 'В базе нет публичного статуса из конфига — обращения закрыть нечем.'
    default:
      return 'Запись не найдена.'
  }
}
