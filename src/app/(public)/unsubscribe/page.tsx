import type { Metadata } from 'next'

import { fill } from '@/core/content'
import { content } from '@/core/locale'
import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await content()
  return { title: t.unsubscribe.title, robots: { index: false } }
}

/**
 * Результат отписки (FR-305).
 *
 * Саму отписку выполняет `/unsubscribe/confirm` — здесь только экран.
 * Разделение не формальное: отписка меняет данные, а рендер страницы Next
 * вправе повторить.
 */
export default async function UnsubscribePage({
  searchParams,
}: PageProps<'/unsubscribe'>) {
  const [{ post, status }, t] = await Promise.all([searchParams, content()])
  const postTitle = Array.isArray(post) ? post[0] : post
  const unknown = (Array.isArray(status) ? status[0] : status) === 'unknown'

  if (unknown) {
    return (
      <StateScreen
        title={t.unsubscribe.failedTitle}
        actions={
          <>
            <PrimaryAction href="/profile">{t.unsubscribe.settingsCta}</PrimaryAction>
            <SecondaryAction href="/">{t.unsubscribe.backCta}</SecondaryAction>
          </>
        }
        note={t.unsubscribe.failedNote}
      >
        <p>{t.unsubscribe.failedLead}</p>
      </StateScreen>
    )
  }

  return (
    <StateScreen
      title={t.unsubscribe.doneTitle}
      actions={
        <>
          <PrimaryAction href="/profile">{t.unsubscribe.doneCta}</PrimaryAction>
          <SecondaryAction href="/">{t.unsubscribe.backCta}</SecondaryAction>
        </>
      }
      note={t.unsubscribe.doneNote}
    >
      <p>
        {postTitle
          ? fill(t.unsubscribe.donePost, { title: postTitle })
          : t.unsubscribe.doneGeneric}{' '}
        {t.unsubscribe.doneRest}
      </p>
    </StateScreen>
  )
}
