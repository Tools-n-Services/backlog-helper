import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'

import {
  formatCount,
  localized,
  plural,
  type Dictionary,
  type Locale,
  type PluralForms,
} from '@/core/content'
import { content, locale } from '@/core/locale'
import { getViewer } from '@/core/session'
import { NOTIFICATION_KINDS } from '@/core/domain/post/notification-prefs'
import { signOutAction } from '@/features/session/actions'
import {
  currentNotificationPrefs,
  saveNotificationPrefs,
} from '@/features/session/notification-actions'
import { queries } from '@/queries'
import { PostCard } from '@/ui/feed/post-card'
import { Avatar } from '@/ui/primitives/avatar'
import { PrimaryAction, StateScreen } from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Профиль', robots: { index: false } }

type Tab = 'posts' | 'votes' | 'notifications'

const TABS: Tab[] = ['posts', 'votes', 'notifications']

/** Профиль (FR-174): мои обращения, голоса, настройки писем. */
export default async function ProfilePage({ searchParams }: PageProps<'/profile'>) {
  const [viewer, t, lang] = await Promise.all([getViewer(), content(), locale()])

  if (!viewer.signedIn) {
    return (
      <StateScreen
        title={t.profile.signedOutTitle}
        actions={<PrimaryAction href="/login">{t.nav.signIn}</PrimaryAction>}
      >
        <p>{t.profile.signedOutLead}</p>
      </StateScreen>
    )
  }

  const { tab } = await searchParams
  const raw = Array.isArray(tab) ? tab[0] : tab
  const active: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'posts'
  const tabLabel: Record<Tab, string> = {
    posts: t.profile.tabPosts,
    votes: t.profile.tabVotes,
    notifications: t.profile.tabNotifications,
  }

  const profile = await queries.getProfile(viewer.id)
  const list = active === 'votes' ? profile.voted : profile.authored

  return (
    <div className="mx-auto max-w-page px-5 pb-16 pt-12 md:px-8 lg:px-10">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar initials={viewer.initials} isTeam={viewer.isTeam} />
        <div className="min-w-0">
          <h1 className="text-h2 font-extrabold tracking-tight text-ink">
            {viewer.name}
          </h1>
          <p className="mt-1 text-small text-faint">
            {viewer.email} · {viewer.memberSince}
          </p>
        </div>

        {/* Выход рядом с именем, а не в глубине настроек: это то действие,
            которое ищут глазами, а не через меню. */}
        <form action={signOutAction} className="ml-auto">
          <button
            type="submit"
            className="rounded-pill border border-line px-4 py-2 text-small font-semibold text-ink-2 transition-colors hover:bg-surface-2"
          >
            {t.profile.signOut}
          </button>
        </form>
      </header>

      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-y border-line py-5">
        <Stat value={profile.stats.authored} label={t.common.posts} lang={lang} />
        <Stat value={profile.stats.voted} label={t.common.voteForms} lang={lang} />
        <Stat
          value={profile.stats.inProgress}
          label={t.profile.inProgressForms}
          lang={lang}
        />
      </dl>

      <nav aria-label={t.profile.sections} className="mt-8 flex flex-wrap gap-2">
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/profile?tab=${key}` as Route}
            aria-current={active === key ? 'true' : undefined}
            className={
              'rounded-pill px-3.5 py-1.5 text-body font-semibold transition-colors ' +
              (active === key
                ? 'bg-ink text-surface'
                : 'text-muted hover:bg-track hover:text-ink')
            }
          >
            {tabLabel[key]}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {active === 'notifications' ? (
          <NotificationSettings t={t} lang={lang} />
        ) : list.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-6 py-12 text-center text-body text-muted">
            {active === 'votes' ? t.profile.emptyVotes : t.profile.emptyPosts}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {list.map((post) => (
              <li key={post.id}>
                <PostCard post={post} signedIn={viewer.signedIn} t={t} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({
  value,
  label,
  lang,
}: {
  value: number
  label: PluralForms
  lang: Locale
}) {
  return (
    <div>
      <dt className="sr-only">{label[2]}</dt>
      <dd>
        <span className="tnum text-h2 font-bold text-ink">
          {formatCount(value, lang)}
        </span>{' '}
        <span className="text-small text-faint">{plural(value, label, lang)}</span>
      </dd>
    </div>
  )
}

/**
 * Настройки писем (FR-307).
 *
 * Каждый пункт называет, что именно придёт: «уведомления о статусах» ничего
 * не говорит ни о поводе, ни о частоте. Список короткий, потому что в нём
 * только те письма, которые продукт действительно отправляет: переключатель
 * без рассылки за ним человек считает настройкой, а почта идёт как раньше —
 * и следующим он нажимает «спам».
 */
async function NotificationSettings({ t, lang }: { t: Dictionary; lang: Locale }) {
  const prefs = await currentNotificationPrefs()

  return (
    <form action={saveNotificationPrefs}>
      <ul className="space-y-3">
        {NOTIFICATION_KINDS.map((kind) => (
          <li key={kind.key} className="rounded-card border border-line bg-surface p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={kind.key}
                defaultChecked={prefs[kind.key]}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
              />
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink">
                  {localized(kind.title, kind.titleEn, lang)}
                </span>
                <span className="mt-0.5 block text-small text-muted">
                  {localized(kind.hint, kind.hintEn, lang)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="submit"
        className="mt-4 rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
      >
        {t.profile.save}
      </button>

      <p className="mt-4 text-small text-faint">{t.profile.lettersNote}</p>
    </form>
  )
}
