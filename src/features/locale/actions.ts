'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { isLocale, LOCALE_COOKIE } from '@/core/content'

/**
 * Переключение языка интерфейса (FR-181).
 *
 * Кука, а не адрес вида `/en/...`: портал форка живёт на своём домене,
 * и удваивать каждый URL ради языка значит удваивать и ссылки в письмах,
 * и канонические адреса для поиска. Выбор человека при этом переживает
 * закрытие вкладки — год, как и сессия.
 */
export async function setLocaleAction(value: string): Promise<void> {
  if (!isLocale(value)) return

  const store = await cookies()
  store.set(LOCALE_COOKIE, value, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
    httpOnly: false,
  })

  /* Язык меняет каждую страницу, а не только текущую: кэш роутера обязан
     забыть отрендеренное на прежнем языке целиком. */
  revalidatePath('/', 'layout')
}
