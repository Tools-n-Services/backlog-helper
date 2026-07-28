import { redirect } from 'next/navigation'

import { consumeSignInLink } from '@/core/auth'

/**
 * Переход по ссылке из письма.
 *
 * Именно route handler, а не страница: вход обязан установить cookie сессии,
 * а при рендере страницы Next этого не позволяет — и правильно делает,
 * иначе побочный эффект случался бы при каждой попытке отрисовать страницу,
 * включая пререндер.
 *
 * Причина неудачи уходит в адрес отдельного экрана: у неё четыре разных
 * случая, и «ссылка не сработала» без объяснения оставляет человека жать
 * её повторно — а повторно она не сработает никогда, она одноразовая.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const result = await consumeSignInLink(token)

  if (result.ok) redirect('/profile')

  /* Причина уходит строкой, а не объединением литералов: типизированные
     маршруты Next не сопоставляют union с шаблоном адреса. */
  const reason: string = result.reason
  redirect(`/login/failed?reason=${reason}`)
}
