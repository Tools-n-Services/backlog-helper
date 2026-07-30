import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { installToken, isInstalled, INSTALL_COOKIE } from '@/core/install'

/**
 * Вход в мастер по токену (В4, docs/09-install.md).
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
  const url = new URL(request.url)
  const given = url.searchParams.get('token')

  if (!token || given !== token || (await isInstalled())) {
    return new NextResponse(null, { status: 404 })
  }

  const store = await cookies()
  store.set(INSTALL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 3600,
  })

  return NextResponse.redirect(new URL('/install', url.origin))
}
