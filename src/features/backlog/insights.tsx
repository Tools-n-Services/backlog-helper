'use client'

import { useRef, useState, useTransition } from 'react'

import { formatCount, plural } from '@/core/content'
import type { CompanyOption } from '@/core/domain/backlog/insights'
import type { InsightSummary, InsightView } from '@/queries/types'

import { addInsightAction, removeInsightAction } from './actions'

/**
 * Цитаты, которые пришли не в портал (FR-621..623).
 *
 * Форма открыта сразу и стоит первой: добавление должно занимать секунды,
 * иначе им не пользуются — а инсайты нужны ровно там, где голосов мало,
 * потому что enterprise-клиент идёт не на портал, а к своему менеджеру.
 *
 * Итог сверху («12 цитат от 9 компаний, суммарно 18 000 ₽») защищает
 * приоритет на встрече лучше любого расчётного числа: это не мнение
 * команды, а перечисление того, кто и что сказал.
 */
export function Insights({
  itemId,
  insights,
  summary,
  companies,
  sources,
}: {
  itemId: string
  insights: InsightView[]
  summary: InsightSummary
  companies: CompanyOption[]
  sources: { key: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)

  const submit = (data: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await addInsightAction(itemId, data)
      if (result.ok) {
        form.current?.reset()
        return
      }
      setError(
        result.reason === 'quote-required'
          ? 'Нужна сама цитата — хотя бы фраза.'
          : 'Не удалось сохранить: работа не найдена или нет прав.',
      )
    })
  }

  return (
    <section>
      <h2 className="mb-1 flex items-baseline gap-2.5 text-body font-bold text-ink">
        Цитаты
        <span className="tnum text-small font-normal text-faint">
          {formatCount(summary.quotes)}
        </span>
      </h2>
      <p className="mb-3 text-small text-muted">{summaryLine(summary)}</p>

      <form ref={form} action={submit} className="mb-4 grid gap-2">
        <label htmlFor="insight-quote" className="sr-only">
          Цитата
        </label>
        <textarea
          id="insight-quote"
          name="quote"
          rows={2}
          required
          minLength={3}
          placeholder="Вставьте фразу целиком — дословно, а не пересказом"
          className="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2 placeholder:text-faint"
        />

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="insight-source" className="sr-only">
            Источник
          </label>
          <select
            id="insight-source"
            name="source"
            defaultValue="call"
            className="h-8 rounded-field border border-line bg-surface px-2 text-small text-ink-2"
          >
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.name}
              </option>
            ))}
          </select>

          <label htmlFor="insight-company" className="sr-only">
            Компания
          </label>
          <select
            id="insight-company"
            name="companyId"
            defaultValue=""
            className="h-8 rounded-field border border-line bg-surface px-2 text-small text-ink-2"
          >
            <option value="">Компания не указана</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          <label htmlFor="insight-author" className="sr-only">
            Почта автора
          </label>
          <input
            id="insight-author"
            name="authorEmail"
            type="email"
            placeholder="почта, если знаем"
            /* Почта нужна ровно для одного: если человек уже голосовал,
               охват не посчитает его вторым (FR-624). */
            className="h-8 min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
          />

          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track disabled:opacity-50"
          >
            {pending ? 'Сохраняю…' : 'Добавить'}
          </button>
        </div>

        {error && <p className="text-small text-ink-2">{error}</p>}
      </form>

      {insights.length > 0 && (
        <ul className="space-y-2">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className="rounded-card border border-line bg-surface px-3 py-2"
            >
              <p className="text-small text-ink-2">«{insight.quote}»</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-small text-faint">
                <span>{insight.sourceName}</span>
                {insight.authorName && <span>· {insight.authorName}</span>}
                {insight.companyName && <span>· {insight.companyName}</span>}
                {insight.companyMrr !== null && (
                  <span className="tnum">· {formatMoney(insight.companyMrr)}</span>
                )}
                <span>· {insight.createdLabel}</span>
                {insight.sourceUrl && (
                  <a
                    href={insight.sourceUrl}
                    className="text-muted underline hover:text-ink"
                    rel="noreferrer"
                  >
                    источник
                  </a>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeInsightAction(itemId, insight.id)
                    })
                  }
                  className="ml-auto rounded-field px-2 py-0.5 text-muted hover:bg-track hover:text-ink disabled:opacity-50"
                >
                  Убрать
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function summaryLine(summary: InsightSummary): string {
  if (summary.quotes === 0) {
    return 'Пока ни одной. Сюда попадает то, что сказали на звонке или в тикете, — фидбэк, которого на портале нет.'
  }

  const quotes = `${formatCount(summary.quotes)} ${plural(summary.quotes, ['цитата', 'цитаты', 'цитат'])}`
  const companies =
    summary.companies > 0
      ? ` от ${formatCount(summary.companies)} ${plural(summary.companies, ['компании', 'компаний', 'компаний'])}`
      : ''
  const money = summary.mrr !== null ? `, суммарно ${formatMoney(summary.mrr)}` : ''
  return `${quotes}${companies}${money}`
}

function formatMoney(value: number): string {
  return `${formatCount(Math.round(value))} ₽`
}
