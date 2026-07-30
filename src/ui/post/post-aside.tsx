import Link from 'next/link'

import {
  fill,
  formatCount,
  localizedForms,
  plural,
  type Dictionary,
  type Locale,
  type PluralForms,
} from '@/core/content'
import { Avatar } from '@/ui/primitives/avatar'
import { StatusBadge } from '@/ui/primitives/status-badge'
import type {
  MergedPostView,
  PersonView,
  StatusChangeView,
} from '@/queries/types'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-3 font-mono text-label uppercase text-faint">{title}</h2>
      {children}
    </section>
  )
}

/** История смены статусов (FR-140): показывает, что обращение не забыто. */
export function StatusHistory({
  history,
  t,
  lang,
}: {
  history: StatusChangeView[]
  t: Dictionary
  lang: Locale
}) {
  return (
    <Section title={t.post.statusHistory}>
      <ol className="space-y-3">
        {history.map((entry, i) => (
          <li key={`${entry.status.key}-${i}`}>
            <StatusBadge status={entry.status} size="sm" lang={lang} />
            <p className="mt-1 text-small text-faint">
              {entry.label}
              {entry.byName && ` · ${entry.byName}`}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/**
 * Список голосовавших (FR-133). Скрывается настройкой приватности продукта:
 * не всякому продукту уместно показывать, кто именно за что голосовал.
 */
export function Voters({
  voters,
  total,
  hidden,
  countLabel,
  countLabelEn,
  t,
  lang,
}: {
  voters: PersonView[]
  total: number
  hidden: boolean
  countLabel: PluralForms
  countLabelEn?: PluralForms
  t: Dictionary
  lang: Locale
}) {
  if (hidden || total === 0) return null
  const rest = total - voters.length
  const forms = localizedForms(countLabel, countLabelEn, lang)

  return (
    <Section title={t.post.voters}>
      <div className="flex flex-wrap items-center gap-1.5">
        {voters.map((person) => (
          <span key={person.name} title={person.name}>
            <Avatar initials={person.initials} size="sm" />
          </span>
        ))}
        {rest > 0 && (
          <span className="tnum text-small text-muted">
            {fill(t.post.votersMore, { count: formatCount(rest, lang) })}
          </span>
        )}
      </div>
      <p className="mt-2 tnum text-small text-faint">
        {fill(t.post.votersTotal, {
          count: formatCount(total, lang),
          label: plural(total, forms, lang),
        })}
      </p>
    </Section>
  )
}

/**
 * Объединённые обращения (FR-141). Показывать их обязательно: иначе человек,
 * чей запрос смержили, считает, что его просто удалили.
 */
export function MergedPosts({
  merged,
  boardSlug,
  t,
  lang,
}: {
  merged: MergedPostView[]
  boardSlug: string
  t: Dictionary
  lang: Locale
}) {
  if (merged.length === 0) return null

  return (
    <Section title={t.post.merged}>
      <ul className="space-y-3">
        {merged.map((item) => (
          <li key={item.ref}>
            <Link
              href={`/${boardSlug}/p/${item.slug}`}
              className="text-body text-ink-2 hover:text-ink"
            >
              {item.title}
            </Link>
            <p className="mt-0.5 tnum text-small text-faint">
              {item.ref} ·{' '}
              {fill(t.post.mergedMoved, {
                count: formatCount(item.movedVotes, lang),
                label: plural(item.movedVotes, t.common.voteForms, lang),
              })}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
