import type { Metadata } from 'next'

import { content } from '@/core/locale'
import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await content()
  return { title: t.auth.failedTitle }
}

/**
 * Почему вход не состоялся.
 *
 * Каждая причина названа своими словами: за «что-то пошло не так» человек
 * не может понять, запросить ли новую ссылку, подождать или написать в
 * поддержку — а это три разных действия.
 */
export default async function LoginFailedPage({
  searchParams,
}: PageProps<'/login/failed'>) {
  const [{ reason }, t] = await Promise.all([searchParams, content()])

  const failures: Record<string, { title: string; text: string }> = {
    invalid: { title: t.auth.failedInvalidTitle, text: t.auth.failedInvalidText },
    expired: { title: t.auth.failedExpiredTitle, text: t.auth.failedExpiredText },
    used: { title: t.auth.failedUsedTitle, text: t.auth.failedUsedText },
  }

  const key = Array.isArray(reason) ? reason[0] : reason
  /* Неизвестная причина сводится к «ссылка не подошла»: она самая частая
     и её совет — запросить новую — верен в любом случае. */
  const failure = (key && failures[key]) || failures.invalid!

  return (
    <StateScreen
      title={failure.title}
      actions={
        <>
          <PrimaryAction href="/login">{t.auth.requestNew}</PrimaryAction>
          <SecondaryAction href="/">{t.auth.readPosts}</SecondaryAction>
        </>
      }
    >
      <p>{failure.text}</p>
    </StateScreen>
  )
}
