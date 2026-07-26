/**
 * Доступ к пользовательским текстам.
 *
 * Тексты живут в content/ (FR-186, 07-ui-brief.md раздел 7). Никаких склеек
 * строк в коде: числа и множественное число — через plural(), иначе локализация
 * форка ломается на «1 голос / 2 голоса / 5 голосов».
 */

import ru from '@content/ru.json'
import { product } from '@config/product'

const dictionaries = { ru, en: ru } as const

export type Dictionary = typeof ru

export const t: Dictionary = dictionaries[product.locale] ?? ru

/**
 * Русские правила множественного числа: one / few / many.
 * Пример: plural(n, ['голос', 'голоса', 'голосов'])
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const tens = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (tens > 1 && tens < 5) return forms[1]
  if (tens === 1) return forms[0]
  return forms[2]
}

/** Разряды неразрывным пробелом: 14375 → «14 375». */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}
