import { cookies, headers } from 'next/headers'
import { cache } from 'react'

import {
  dictionaryFor,
  isLocale,
  preferredLocale,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
} from '@/core/content'

/**
 * Язык этого запроса (FR-181).
 *
 * Только для сервера: читает куку и заголовок браузера. Порядок выбора —
 * кука (человек переключил руками) → Accept-Language (пришёл впервые) →
 * язык продукта из конфига. Кука выше браузера намеренно: человек
 * с английской системой, выбравший русский, не должен получать английский
 * после каждого перехода.
 *
 * `cache` из React — на время одного рендера: заголовки читаются один раз,
 * а не в каждом компоненте, который спрашивает язык.
 */
export const locale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  const accepted = (await headers()).get('accept-language') ?? ''
  return preferredLocale(accepted)
})

/** Словарь текущего запроса. */
export async function content(): Promise<Dictionary> {
  return dictionaryFor(await locale())
}
