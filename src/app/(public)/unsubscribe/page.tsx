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
 * Результат отписки (FR-305).
 *
 * Саму отписку выполняет `/unsubscribe/confirm` — здесь только экран.
 * Разделение не формальное: отписка меняет данные, а рендер страницы Next
 * вправе повторить.
 */
export default async function UnsubscribePage({
  searchParams,
}: PageProps<'/unsubscribe'>) {
  const { post, status } = await searchParams
  const postTitle = Array.isArray(post) ? post[0] : post
  const unknown = (Array.isArray(status) ? status[0] : status) === 'unknown'

  if (unknown) {
    return (
      <StateScreen
        title="Ссылка не подошла"
        actions={
          <>
            <PrimaryAction href="/profile">Настроить письма</PrimaryAction>
            <SecondaryAction href="/">Вернуться на портал</SecondaryAction>
          </>
        }
        note="Возможно, ссылка скопирована не целиком или подписку уже удалили."
      >
        <p>
          Отписаться по этой ссылке не получилось. Все письма можно настроить
          в профиле — там же видно, за какими обращениями вы следите.
        </p>
      </StateScreen>
    )
  }

  return (
    <StateScreen
      title="Вы отписались"
      actions={
        <>
          <PrimaryAction href="/profile">Настроить все письма</PrimaryAction>
          <SecondaryAction href="/">Вернуться на портал</SecondaryAction>
        </>
      }
      note="Отписка сработала без входа — по ссылке из письма."
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
