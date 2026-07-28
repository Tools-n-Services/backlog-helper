import type { Metadata } from 'next'

import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export const metadata: Metadata = { title: 'Ссылка не сработала' }

/**
 * Почему вход не состоялся.
 *
 * Каждая причина названа своими словами: за «что-то пошло не так» человек
 * не может понять, запросить ли новую ссылку, подождать или написать в
 * поддержку — а это три разных действия.
 */
const FAILURES: Record<string, { title: string; text: string }> = {
  invalid: {
    title: 'Ссылка не подошла',
    text: 'Возможно, она скопирована не целиком: почтовые клиенты переносят длинные ссылки на вторую строку, и половина остаётся в буфере.',
  },
  expired: {
    title: 'Ссылка устарела',
    text: 'Ссылка действует 15 минут — этого достаточно, чтобы дойти до почты, и недостаточно тому, кто найдёт письмо позже.',
  },
  used: {
    title: 'Ссылка уже использована',
    text: 'Каждая ссылка открывает вход ровно один раз. Если входили не вы — запросите новую и напишите нам.',
  },
}

const FALLBACK = FAILURES.invalid!

export default async function LoginFailedPage({
  searchParams,
}: PageProps<'/login/failed'>) {
  const { reason } = await searchParams
  const key = Array.isArray(reason) ? reason[0] : reason
  const failure = (key && FAILURES[key]) || FALLBACK

  return (
    <StateScreen
      title={failure.title}
      actions={
        <>
          <PrimaryAction href="/login">Запросить новую ссылку</PrimaryAction>
          <SecondaryAction href="/">Читать обращения</SecondaryAction>
        </>
      }
    >
      <p>{failure.text}</p>
    </StateScreen>
  )
}
