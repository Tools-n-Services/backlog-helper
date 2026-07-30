import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import { scoreFormula } from '@config/scoring'
import { formatCount, plural } from '@/core/content'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { queries } from '@/queries'
import type { BacklogItemView, BacklogSort } from '@/queries/types'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Бэклог', robots: { index: false } }

/**
 * Бэклог — список работ, а не обращений (06-backlog.md, раздел 0).
 *
 * Порядок ручной: расчётный приоритет остаётся подсказкой, а решает человек
 * (FR-615). Завершённое скрыто по умолчанию — бэклог отвечает на вопрос
 * «что дальше», а не «что было».
 */
export default async function BacklogPage({
  searchParams,
}: PageProps<'/admin/backlog'>) {
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

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const many = (key: string) => {
    const value = params[key]
    if (!value) return []
    return (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(','))
  }

  const sortParam = one('sort')
  const sort: BacklogSort =
    sortParam === 'score' || sortParam === 'mrr' ? sortParam : 'rank'

  const query = {
    statusKeys: many('status'),
    themeSlugs: many('theme'),
    kinds: many('kind'),
    search: one('q') ?? '',
    includeDone: one('done') === '1',
    sort,
  }
  const backlog = await queries.getBacklog(query)

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <h1 className="text-h3 font-bold text-ink">Бэклог</h1>
        <p className="text-small text-muted">
          {formatCount(backlog.total)}{' '}
          {plural(backlog.total, ['работа', 'работы', 'работ'])}
          {' · '}
          единицы работы, а не обращения
        </p>
        <Link
          href="/admin/backlog/new"
          className="ml-auto rounded-pill bg-ink px-4 py-1.5 text-small font-semibold text-surface hover:bg-ink-hover"
        >
          Завести работу
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-2 text-small">
        <Facets label="Этап" param="status" values={backlog.statuses} params={params} />
        <Facets label="Тип" param="kind" values={backlog.kinds} params={params} />
        <Facets
          label="Тема"
          param="theme"
          values={backlog.themes.map((t) => ({ key: t.slug, name: t.name, count: t.count }))}
          params={params}
        />
        {/* Порядок — ручной по умолчанию: расчёт остаётся подсказкой,
            а решение принимают люди (FR-615). */}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-faint">Порядок</span>
          {SORTS.map((option) => (
            <Link
              key={option.key}
              href={setParam(params, 'sort', option.key === 'rank' ? null : option.key)}
              title={option.hint}
              className={
                'rounded-field px-2 py-0.5 ' +
                (sort === option.key ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-track')
              }
            >
              {option.name}
            </Link>
          ))}
        </span>

        <Link
          href={toggleParam(params, 'done', '1')}
          className={
            'rounded-field px-2 py-0.5 ' +
            (query.includeDone ? 'bg-ink text-surface' : 'text-muted hover:bg-track')
          }
        >
          Показать завершённые
        </Link>
      </div>

      {backlog.items.length === 0 ? (
        <p className="px-4 py-16 text-center text-body text-muted">
          Под эти фильтры ничего не подошло. Бэклог наполняется из очереди триажа:
          решение «в бэклог» заводит работу из обращения.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {backlog.items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ItemRow({ item }: { item: BacklogItemView }) {
  return (
    <Link
      href={`/admin/backlog/${item.id}` as Route}
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-track"
    >
      <span className="w-28 shrink-0 text-small text-faint">{item.statusName}</span>
      <span className="w-20 shrink-0 text-small text-muted">{item.kindName}</span>

      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">{item.title}</span>
        {item.problem && (
          <span className="mt-0.5 block truncate text-small text-muted">{item.problem}</span>
        )}
      </span>

      {item.themeName && (
        <span className="shrink-0 text-small text-faint">{item.themeName}</span>
      )}

      {/* Спрос: сколько обращений питают работу и сколько за ними голосов.
          У техдолга здесь пусто, и это нормальное состояние, а не ошибка. */}
      <span className="tnum w-32 shrink-0 text-right text-small text-muted">
        {item.postCount > 0
          ? `${formatCount(item.postCount)} ${plural(item.postCount, ['обращение', 'обращения', 'обращений'])} · ${formatCount(item.voteCount)}`
          : '—'}
      </span>

      {/* Охват и приоритет — рядом и в одной шкале: score без охвата
          не объяснить, а охват без score не сравнить. */}
      <span className="tnum w-20 shrink-0 text-right text-small text-muted">
        {item.reach > 0 ? formatCount(item.reach) : '—'}
      </span>
      <span className="tnum w-16 shrink-0 text-right text-small font-semibold text-ink">
        {item.score === null ? '—' : formatScore(item.score)}
      </span>

      <span className="w-24 shrink-0 text-right text-small text-faint">
        {item.targetRelease ?? item.estimate ?? ''}
      </span>
    </Link>
  )
}

const SORTS: { key: BacklogSort; name: string; hint: string }[] = [
  { key: 'rank', name: 'ручной', hint: 'Порядок, который задала команда' },
  { key: 'score', name: scoreFormula.name, hint: scoreFormula.hint },
  { key: 'mrr', name: 'деньги', hint: 'Сумма MRR затронутых компаний' },
]

/** Приоритет — с одним знаком: вторая цифра после запятой ничего не решает. */
function formatScore(score: number): string {
  return score >= 100 ? formatCount(Math.round(score)) : score.toFixed(1)
}

function Facets({
  label,
  param,
  values,
  params,
}: {
  label: string
  param: string
  values: { key: string; name: string; count: number }[]
  params: Record<string, string | string[] | undefined>
}) {
  if (values.length === 0) return null
  const active = new Set(
    ((): string[] => {
      const v = params[param]
      if (!v) return []
      return (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(','))
    })(),
  )

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-faint">{label}</span>
      {values.map((value) => (
        <Link
          key={value.key}
          href={toggleParam(params, param, value.key)}
          className={
            'rounded-field px-2 py-0.5 ' +
            (active.has(value.key) ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-track')
          }
        >
          {value.name} <span className="tnum text-faint">{value.count}</span>
        </Link>
      ))}
    </span>
  )
}

/** Ставит одиночное значение в адресе; null убирает его совсем. */
function setParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  value: string | null,
): Route {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || k === key) continue
    for (const item of Array.isArray(v) ? v : [v]) next.append(k, item)
  }
  if (value !== null) next.set(key, value)

  const qs = next.toString()
  return (qs ? `/admin/backlog?${qs}` : '/admin/backlog') as Route
}

/** Переключает значение фильтра в адресе, сохраняя остальные. */
function toggleParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  value: string,
): Route {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    for (const item of Array.isArray(v) ? v : [v]) next.append(k, item)
  }

  const current = next.getAll(key).flatMap((v) => v.split(','))
  next.delete(key)
  const updated = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value]
  if (updated.length) next.set(key, updated.join(','))

  const qs = next.toString()
  return (qs ? `/admin/backlog?${qs}` : '/admin/backlog') as Route
}
