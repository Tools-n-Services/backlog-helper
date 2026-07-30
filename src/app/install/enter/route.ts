import { cookies } from 'next/headers'

import { installToken, isInstalled, INSTALL_COOKIE } from '@/core/install'

/**
 * Вход в мастер по токену (В4, В6, docs/09-install.md).
 *
 * Отдельным маршрутом, а не проверкой на самой странице: куку можно ставить
 * только в обработчике или серверном действии — во время рендера страницы
 * Next этого не позволяет, и попытка заканчивается не отказом, а падением.
 *
 * Заодно токен перестаёт жить в адресной строке: дальше он в куке,
 * не попадает в историю браузера и не утекает заголовком Referer.
 */
export async function GET(request: Request): Promise<Response> {
  const token = installToken()
  const given = new URL(request.url).searchParams.get('token')

  if (!token || given !== token || (await isInstalled())) {
    return new Response(null, { status: 404 })
  }

  const store = await cookies()
  store.set(INSTALL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 3600,
  })

  /* Ответ отдаётся напрямую, а не через NextResponse.redirect, и адрес
     в нём относительный. Причина проверена на живом контейнере: Next
     приводит адрес перенаправления к тому, по которому знает себя сам, —
     за обратным прокси это внутреннее имя вроде `http://0.0.0.0:3000`,
     и человек уезжал бы на адрес, которого снаружи не существует.
     Относительный Location разрешает браузер — относительно настоящего
     домена, по которому пришёл. */
  return new Response(null, { status: 307, headers: { Location: '/install' } })
}
