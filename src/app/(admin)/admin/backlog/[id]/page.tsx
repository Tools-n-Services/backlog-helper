import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { scoreFormula } from '@config/scoring'
import { formatCount, plural } from '@/core/content'
import { insightSources, listCompanies } from '@/core/domain/backlog/insights'
import { listInternalStatuses, listThemes } from '@/core/domain/backlog/options'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { createItemAction, updateItemAction } from '@/features/backlog/actions'
import { Insights } from '@/features/backlog/insights'
import { ItemFields } from '@/features/backlog/item-fields'
import { LinkedPosts } from '@/features/backlog/link-posts'
import { queries } from '@/queries'
import type { BacklogItemDetailView, BacklogItemView } from '@/queries/types'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export async function generateMetadata({
  params,
}: PageProps<'/admin/backlog/[id]'>): Promise<Metadata> {
  const { id } = await params
  const item = await queries.getBacklogItem(id)
  return { title: item?.title ?? 'Работа', robots: { index: false } }
}

/**
 * Карточка работы.
 *
 * Три вопроса на одном экране: что делаем, чей это спрос и из каких частей
 * состоит. Спрос — не украшение: у работы без обращений его нет вовсе,
 * и решение о приоритете принимается по другим основаниям.
 */
export default async function BacklogItemPage({
  params,
}: PageProps<'/admin/backlog/[id]'>) {
  const viewer = await getViewer()
  if (!can(viewer, 'triage.decide')) {
    return (
      <StateScreen
        title="Недостаточно прав"
        actions={<PrimaryAction href="/">Вернуться на портал</PrimaryAction>}
      >
        <p>Бэклог ведёт команда продукта.</p>
      </StateScreen>
    )
  }

  const { id } = await params
  const [item, themes, companies] = await Promise.all([
    queries.getBacklogItem(id),
    listThemes(),
    listCompanies(),
  ])
  if (!item) notFound()

  const statuses = listInternalStatuses()

  return (
    <div className="mx-auto max-w-page px-4 py-6">
      <nav className="mb-3 flex flex-wrap items-center gap-2 text-small text-faint">
        <Link href="/admin/backlog" className="hover:text-ink">
          Бэклог
        </Link>
        {item.parent && (
          <>
            <span aria-hidden>/</span>
            <Link
              href={`/admin/backlog/${item.parent.id}` as Route}
              className="hover:text-ink"
            >
              {item.parent.title}
            </Link>
          </>
        )}
      </nav>

      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h3 font-bold text-ink">{item.title}</h1>
        <span className="text-small text-muted">{item.kindName}</span>
        {item.statusName && (
          <span className="rounded-field bg-track px-2 py-0.5 text-small text-ink-2">
            {item.statusName}
          </span>
        )}
        {item.themeName && <span className="text-small text-faint">{item.themeName}</span>}
        <span className="ml-auto text-small text-faint">
          изменено {item.updatedLabel}
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <LinkedPosts itemId={item.id} posts={item.posts} />
          <Insights
            itemId={item.id}
            insights={item.insights}
            summary={item.insightSummary}
            companies={companies}
            sources={insightSources}
          />
          <Phases item={item} />
        </div>

        <aside className="lg:sticky lg:top-16 lg:self-start">
          <h2 className="mb-3 text-body font-bold text-ink">Карточка</h2>
          <form action={updateItemAction.bind(null, item.id)}>
            <ItemFields item={item} themes={themes} statuses={statuses} />
            <button
              type="submit"
              className="mt-4 w-full rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface hover:bg-ink-hover"
            >
              Сохранить
            </button>
          </form>

          <Demand item={item} />
        </aside>
      </div>
    </div>
  )
}

/**
 * Спрос и приоритет — рядом с формой оценок.
 *
 * Охват стоит отдельной строкой от суммы голосов намеренно: они почти всегда
 * расходятся, и расхождение — это и есть ответ на вопрос «сколько тут разных
 * людей». Сумма голосов по четырём связанным обращениям считает одного
 * человека четырежды, охват — один раз и с весом его сегмента (FR-612).
 */
function Demand({ item }: { item: BacklogItemDetailView }) {
  const rows: { label: string; value: string; hint?: string }[] = [
    {
      label: 'Обращений',
      value:
        item.postCount > 0
          ? `${formatCount(item.postCount)} · ${formatCount(item.voteCount)} ${plural(item.voteCount, ['голос', 'голоса', 'голосов'])}`
          : '—',
    },
    {
      label: 'Охват',
      value: item.reach > 0 ? formatCount(item.reach) : '—',
      hint: 'уникальные люди с весом сегмента',
    },
    {
      label: 'Деньги',
      value: item.mrrSum === null ? '—' : `${formatCount(Math.round(item.mrrSum))} ₽`,
      hint: 'MRR затронутых компаний',
    },
    {
      label: scoreFormula.name,
      value:
        item.score === null
          ? 'нет оценки'
          : item.score >= 100
            ? formatCount(Math.round(item.score))
            : item.score.toFixed(1),
      hint: scoreFormula.hint.toLowerCase(),
    },
  ]

  return (
    <dl className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-3 px-3 py-1.5">
          <dt className="text-small text-muted">{row.label}</dt>
          {row.hint && <dd className="text-small text-faint">{row.hint}</dd>}
          <dd className="tnum ml-auto text-small font-semibold text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Фазы: крупная работа режется на части через `parent_id` (FR-608).
 *
 * Один уровень вложенности — сознательно: дерево глубже двух уровней
 * перестаёт помещаться в голове, а планирование от этого не точнее.
 */
function Phases({ item }: { item: BacklogItemView & { children: BacklogItemView[] } }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2.5 text-body font-bold text-ink">
        Фазы
        <span className="tnum text-small font-normal text-faint">
          {formatCount(item.children.length)}
        </span>
      </h2>

      {item.children.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-card border border-line bg-surface">
          {item.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/admin/backlog/${child.id}` as Route}
                className="flex items-center gap-3 px-3 py-2 hover:bg-track"
              >
                <span className="w-28 shrink-0 text-small text-faint">
                  {child.statusName}
                </span>
                <span className="min-w-0 flex-1 text-small font-semibold text-ink">
                  {child.title}
                </span>
                <span className="shrink-0 text-small text-muted">{child.kindName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form action={createItemAction} className="flex items-center gap-2">
        <input type="hidden" name="parentId" value={item.id} />
        <input type="hidden" name="kind" value={item.kind} />
        <label htmlFor="phase-title" className="sr-only">
          Название фазы
        </label>
        <input
          id="phase-title"
          name="title"
          required
          minLength={3}
          placeholder="Добавить фазу"
          className="h-8 min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
        />
        <button
          type="submit"
          className="shrink-0 rounded-field border border-line px-2.5 py-1 text-small text-ink-2 hover:bg-track"
        >
          Добавить
        </button>
      </form>
    </section>
  )
}
