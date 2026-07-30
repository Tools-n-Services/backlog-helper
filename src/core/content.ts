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

export type Dictionary = Omit<typeof ru, 'common' | 'post' | 'profile'> & {
  common: Omit<(typeof ru)['common'], 'posts' | 'commentForms' | 'voteForms'> & {
    posts: PluralForms
    commentForms: PluralForms
    voteForms: PluralForms
  }
  post: Omit<(typeof ru)['post'], 'helpfulForms'> & {
    helpfulForms: PluralForms
  }
  profile: Omit<(typeof ru)['profile'], 'inProgressForms'> & {
    inProgressForms: PluralForms
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

/**
 * Язык, на котором написан текст (FR-181).
 *
 * Считаем буквы: кириллических больше латинских — русский, иначе английский.
 * Для пары «русский / английский» этого достаточно, и в отличие от библиотек
 * определения языка эта функция не ошибается на коротком тексте вроде
 * «не грузится» — а короткого текста в багрепортах большинство.
 *
 * null — букв нет вовсе: «404», «???». Переводить там нечего, и обращение
 * не должно занимать очередь и деньги.
 */
export function detectLocale(text: string): Locale | null {
  let cyrillic = 0
  let latin = 0
  for (const char of text) {
    if (/[а-яё]/i.test(char)) cyrillic++
    else if (/[a-z]/i.test(char)) latin++
  }
  if (cyrillic === 0 && latin === 0) return null
  return cyrillic > latin ? 'ru' : 'en'
}

/**
 * Перевод для смотрящего — или ничего.
 *
 * Ничего в трёх случаях: текст уже на языке читателя, перевода ещё нет
 * (воркер не дошёл), язык оригинала неизвестен. Во всех трёх показывается
 * оригинал — молча, без пометок: «перевод недоступен» на русском тексте
 * для русского читателя выглядит поломкой, а не заботой.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  lang: Locale,
  sourceLocale: string | null,
): T | null {
  if (!sourceLocale || sourceLocale === lang) return null
  return translations.find((entry) => entry.locale === lang) ?? null
}

/**
 * Язык оригинала для подписи «Переведено с русского».
 *
 * В базе это обычная строка: там может оказаться язык импорта или язык,
 * который портал больше не поддерживает. Подпись при этом обязана остаться
 * осмысленной, поэтому неизвестное сводится к языку продукта.
 */
export function sourceLanguage(sourceLocale: string | null): Locale {
  if (isLocale(sourceLocale)) return sourceLocale
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

/**
 * Подстановка в строку словаря: «и ещё {count}» → «и ещё 12».
 *
 * Порядок слов в языках разный: «и ещё 12» против «12 more». Склейка в коде
 * («и ещё » + n) фиксирует русский порядок и во втором языке даёт кальку,
 * поэтому целая фраза с местом для числа лежит в словаре.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}

/** Формы счётного слова на языке смотрящего: «голос» / «vote». */
export function localizedForms(
  forms: PluralForms,
  english: PluralForms | undefined,
  lang: Locale,
): PluralForms {
  return lang === 'en' && english ? english : forms
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
