import type { Metadata } from 'next'

import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Ссылка отправлена' }

/**
 * «Письмо отправлено» — отдельный экран, а не тост (07-ui-brief.md, раздел 3).
 *
 * Тост исчезает, а человек в этот момент уходит в почтовый клиент и возвращается
 * на страницу, где непонятно, ушло письмо или нет.
 */
export default async function LoginSentPage({
  searchParams,
}: PageProps<'/login/sent'>) {
  const { email } = await searchParams
  const address = (Array.isArray(email) ? email[0] : email) ?? ''

  return (
    <StateScreen
      title={
        <>
          Ссылка <span className="font-light">отправлена</span>
        </>
      }
      actions={
        <>
          <PrimaryAction href="/login">Отправить снова</PrimaryAction>
          <SecondaryAction href="/login">Ввести другой адрес</SecondaryAction>
        </>
      }
      note="Ссылка действует 15 минут. Если письма нет, проверьте папку «Спам» — иногда оно попадает туда при первом входе."
    >
      <p>
        Письмо ушло на{' '}
        <span className="font-semibold text-ink-2">{address || 'указанный адрес'}</span>
        . Откройте ссылку из письма — вернётесь на страницу, с которой начали.
      </p>
    </StateScreen>
  )
}
