import type { Metadata } from 'next'

import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export const metadata: Metadata = {
  title: 'Отписка',
  robots: { index: false },
}

/**
 * Отписка по ссылке из письма (FR-305).
 *
 * Работает БЕЗ входа и в один клик — это требование RFC 8058 и здравого
 * смысла: если отписка требует вспомнить пароль, человек нажмёт «спам»,
 * и следующие письма продукта не увидит уже никто.
 */
export default async function UnsubscribePage({
  searchParams,
}: PageProps<'/unsubscribe'>) {
  const { post } = await searchParams
  const postTitle = Array.isArray(post) ? post[0] : post

  return (
    <StateScreen
      title="Вы отписались"
      actions={
        <>
          <PrimaryAction href="/profile">Настроить все письма</PrimaryAction>
          <SecondaryAction href="/">Вернуться на портал</SecondaryAction>
        </>
      }
      note="Отписка сработала без входа — по одноразовой ссылке из письма."
    >
      <p>
        {postTitle
          ? `Больше не будем писать об обновлениях обращения «${postTitle}».`
          : 'Больше не будем писать об обновлениях этого обращения.'}{' '}
        Остальные письма приходят как раньше.
      </p>
    </StateScreen>
  )
}
