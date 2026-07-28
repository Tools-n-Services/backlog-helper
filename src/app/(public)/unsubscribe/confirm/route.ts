import { redirect } from 'next/navigation'

import { unsubscribeByToken } from '@/core/domain/post/notifications'

/**
 * Отписка по ссылке из письма (FR-305).
 *
 * Route handler, а не страница: отписка меняет данные, а рендер страницы
 * Next может повторить — например, при перезагрузке или пререндере. Побочный
 * эффект в рендере рано или поздно случится не тогда, когда его ждали.
 *
 * Один переход без входа — сознательно. Требовать пароль у человека,
 * который хочет перестать получать письма, значит получить жалобу на спам
 * вместо отписки, а с ней и проблемы с доставкой всей остальной почты.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const result = await unsubscribeByToken(token)

  if (!result.ok) redirect('/unsubscribe?status=unknown')
  redirect(`/unsubscribe?post=${encodeURIComponent(result.postTitle)}`)
}
