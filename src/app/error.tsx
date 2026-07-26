'use client'

import Link from 'next/link'

/**
 * Ошибка сети или сервера (07-ui-brief.md, раздел 5).
 *
 * Не «что-то пошло не так»: текст называет, что именно не загрузилось и что
 * с данными всё в порядке, а кнопка повторяет попытку, а не отправляет на
 * главную. Запрещённые формулировки — в разделе 7 брифа.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-page px-5 py-24 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[52ch] text-center">
        <h1 className="text-h2 font-extrabold tracking-tight text-ink">
          Лента не загрузилась
        </h1>
        <p className="mt-4 text-body-l leading-relaxed text-muted">
          Сервер не ответил вовремя. Обращения на месте — не загрузился только
          список.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
          >
            Повторить
          </button>
          <Link
            href="/"
            className="rounded-pill border border-line px-5 py-2.5 text-small font-semibold text-ink-2 transition-colors hover:bg-track"
          >
            На главную
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-label uppercase text-faint">
            код {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
