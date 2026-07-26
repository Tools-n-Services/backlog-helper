'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

import { formatCount } from '@/core/content'
import type { FeedFacets, FeedQuery } from '@/queries/types'

import {
  clearFacets,
  feedHref,
  hasAnyFilter,
  toggleFacet,
  type FacetDimension,
} from './query-params'

/**
 * Панель фильтров: мультивыбор со счётчиками, сброс, перенос состояния в URL.
 * Счётчики считаются с учётом остальных фильтров — иначе после первого выбора
 * панель показывает нули и становится бесполезной.
 */
export function FilterPanel({
  query,
  facets,
}: {
  query: FeedQuery
  facets: FeedFacets
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  /* Отметка ставится сразу, не дожидаясь ответа сервера: контролируемый чекбокс
     без этого «отскакивает» назад на всё время перехода и выглядит сломанным.
     Значение само сбросится на серверное, когда придут новые пропсы. */
  const [shown, setShown] = useOptimistic(query)

  const go = (next: FeedQuery) => {
    startTransition(() => {
      setShown(next)
      router.push(feedHref(next))
    })
  }

  const groups: {
    dimension: FacetDimension
    title: string
    items: { key: string; name: string; count: number }[]
    selected: string[]
  }[] = [
    {
      dimension: 'status',
      title: 'Статус',
      items: facets.statuses,
      selected: shown.statusKeys,
    },
    { dimension: 'type', title: 'Тип', items: facets.types, selected: shown.typeKeys },
    {
      dimension: 'category',
      title: 'Категория',
      items: facets.categories,
      selected: shown.categorySlugs,
    },
  ]

  return (
    <div
      className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
      aria-busy={pending}
    >
      {groups.map((group) => (
        <fieldset key={group.dimension} className="mb-7 border-0 p-0">
          <legend className="mb-2.5 flex w-full items-center justify-between gap-2">
            <span className="font-mono text-label uppercase text-faint">
              {group.title}
            </span>
            {group.selected.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  go({
                    ...shown,
                    ...(group.dimension === 'status' && { statusKeys: [] }),
                    ...(group.dimension === 'type' && { typeKeys: [] }),
                    ...(group.dimension === 'category' && { categorySlugs: [] }),
                  })
                }
                className="text-small text-faint underline underline-offset-2 hover:text-ink"
              >
                сбросить
              </button>
            )}
          </legend>

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const checked = group.selected.includes(item.key)
              return (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 transition-colors hover:bg-track">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => go(toggleFacet(shown, group.dimension, item.key))}
                      className="size-4 shrink-0 accent-[var(--color-ink)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-ink-2">
                      {item.name}
                    </span>
                    <span className="tnum shrink-0 text-small text-faint">
                      {formatCount(item.count)}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}

      {hasAnyFilter(shown) && (
        <button
          type="button"
          onClick={() => go(clearFacets(shown))}
          className="rounded-pill border border-line px-4 py-2 text-small font-semibold text-ink-2 transition-colors hover:bg-track"
        >
          Сбросить все фильтры
        </button>
      )}
    </div>
  )
}
