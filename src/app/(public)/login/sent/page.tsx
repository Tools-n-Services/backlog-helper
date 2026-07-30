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
  return { title: t.auth.sentTitle }
}

/**
 * «Письмо отправлено» — отдельный экран, а не тост (07-ui-brief.md, раздел 3).
 *
 * Тост исчезает, а человек в этот момент уходит в почтовый клиент и возвращается
 * на страницу, где непонятно, ушло письмо или нет.
 */
export default async function LoginSentPage({
  searchParams,
}: PageProps<'/login/sent'>) {
  const [{ email }, t] = await Promise.all([searchParams, content()])
  const address = (Array.isArray(email) ? email[0] : email) ?? ''
  /* Адрес — не часть фразы, а вставка в неё: у английского порядок слов свой,
     и склеенное «Письмо ушло на » + адрес во втором языке звучит калькой. */
  const lead = fill(t.auth.sentLead, {
    address: address || t.auth.sentAddressFallback,
  })

  return (
    <StateScreen
      title={
        <>
          {t.auth.sentHeadingBold}{' '}
          <span className="font-light">{t.auth.sentHeadingLight}</span>
        </>
      }
      actions={
        <>
          <PrimaryAction href="/login">{t.auth.sendAgain}</PrimaryAction>
          <SecondaryAction href="/login">{t.auth.otherAddress}</SecondaryAction>
        </>
      }
      note={t.auth.sentNote}
    >
      <p>{lead}</p>
    </StateScreen>
  )
}
