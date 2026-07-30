/**
 * Словари и правила языка (FR-181).
 *
 * Модуль чистый: ни куки, ни заголовков. Его импортируют и клиентские
 * компоненты — счётчик голосов склоняется в браузере, — а `next/headers`
 * в клиентской сборке ломает её целиком. Язык текущего запроса живёт
 * рядом, в `locale.ts`, и доступен только на сервере.
 *
 * Тексты живут в content/ (07-ui-brief.md раздел 7). Никаких склеек строк
 * в коде: числа и множественное число — через plural(), иначе второй язык
 * ломается на «1 голос / 2 голоса / 5 голосов» и «1 vote / 2 votes».
 *
 * Язык выбирается на каждый запрос, а не при импорте модуля. Разница
 * принципиальная: язык — свойство смотрящего, а не сборки. Раньше `t`
 * читался один раз из конфига продукта, и второй язык был невозможен
 * в принципе.
 *
 * Порядок выбора: кука (человек переключил руками) → Accept-Language
 * (пришёл впервые) → язык продукта из конфига. Кука выше браузера намеренно:
 * человек с английской системой, выбравший русский, не должен получать
 * английский после каждого перехода.
 */

import ru from '@content/ru.json'
import en from '@content/en.json'
import { product } from '@config/product'

export type Locale = 'ru' | 'en'

export const LOCALE_COOKIE = 'locale'

/** Языки интерфейса и их самоназвания — для переключателя. */
export const locales: { key: Locale; name: string }[] = [
  { key: 'ru', name: 'Русский' },
  { key: 'en', name: 'English' },
]

/**
 * Формы множественного числа хранятся тройкой прямо в словаре: JSON отдаёт
 * их как `string[]`, а функции нужен кортеж — иначе пропущенная форма
 * выясняется в рантайме на живом счётчике.
 */
export type PluralForms = [string, string, string]

export type Dictionary = Omit<typeof ru, 'common'> & {
  common: Omit<(typeof ru)['common'], 'posts' | 'commentForms'> & {
    posts: PluralForms
    commentForms: PluralForms
  }
}

/* Словарь второго языка обязан совпадать по форме с первым: пропущенный
   ключ должен ломать сборку, а не показывать `undefined` живому человеку. */
const dictionaries: Record<Locale, Dictionary> = {
  ru: ru as Dictionary,
  en: en as Dictionary,
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'ru' || value === 'en'
}

/**
 * Язык из заголовка браузера.
 *
 * Разбор нарочно грубый: нужен только первый понятный нам тег, а не полная
 * реализация RFC 9110 с весами. `ru-RU,ru;q=0.9,en;q=0.8` — это «русский».
 */
export function preferredLocale(acceptLanguage: string): Locale {
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0]
    if (isLocale(tag)) return tag
  }
  return isLocale(product.locale) ? product.locale : 'ru'
}

/** Словарь конкретного языка — для писем и фоновых проходов, где запроса нет. */
export function dictionaryFor(value: Locale): Dictionary {
  return dictionaries[value]
}

/**
 * Множественное число по правилам языка.
 *
 * Формы приходят тройкой: [одна, несколько, много]. У русского это
 * «голос / голоса / голосов», у английского работают первые две —
 * «vote / votes», — и тройка остаётся одна на оба языка, без ветвлений
 * в компонентах.
 */
export function plural(n: number, forms: PluralForms, lang: Locale = 'ru'): string {
  if (lang === 'en') return Math.abs(n) === 1 ? forms[0] : forms[1]

  const abs = Math.abs(n) % 100
  const tens = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (tens > 1 && tens < 5) return forms[1]
  if (tens === 1) return forms[0]
  return forms[2]
}

/** Разряды: 14375 → «14 375» или «14,375». */
export function formatCount(n: number, lang: Locale = 'ru'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(n)
}

/**
 * Название на языке смотрящего.
 *
 * Доски, статусы и типы обращений живут в конфиге с основным названием
 * и необязательным английским: у форка может не быть второго языка вовсе,
 * и заставлять его заполнять оба поля — лишняя работа ради ничего.
 */
export function localized(
  name: string,
  english: string | undefined,
  lang: Locale,
): string {
  return lang === 'en' && english ? english : name
}
