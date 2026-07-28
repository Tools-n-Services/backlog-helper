/**
 * Автооценка приоритета для очереди триажа (FR-531).
 *
 *   severity × частота × log(1 + затронутых) × вес сегмента репортера
 *
 * Логарифм не украшение: без него один баг с тысячей затронутых вытесняет
 * из очереди всё остальное, включая блокирующие проблемы с десятью.
 *
 * Это подсказка для сортировки, а не решение: приоритет команды ставит
 * человек отдельным полем (FR-536).
 */

import {
  frequencies,
  segmentWeights,
  severities,
  type FrequencyKey,
  type SeverityKey,
} from '@config/scoring'

/**
 * Ключи приходят строками, а не объединениями `SeverityKey`/`FrequencyKey`:
 * в базе это текстовые колонки, потому что набор severity различается между
 * продуктами (форк правит config/scoring.ts). Веса ищутся по конфигурации
 * и подставляют разумное значение для незнакомого ключа — это лучше, чем
 * приводить строку из базы к типу приведением на месте вызова и делать вид,
 * что данные уже проверены.
 */
export interface PriorityInput {
  severity: SeverityKey | string | null
  frequency: FrequencyKey | string | null
  affectedCount: number
  /** Сегмент репортера: enterprise / paid / free. */
  segment: string
}

export function severityWeight(key: SeverityKey | string | null): number {
  return severities.find((s) => s.key === key)?.weight ?? 1
}

export function frequencyWeight(key: FrequencyKey | string | null): number {
  return frequencies.find((f) => f.key === key)?.weight ?? 0.6
}

export function autoPriority(input: PriorityInput): number {
  const reach = Math.log1p(Math.max(0, input.affectedCount))
  const segment = segmentWeights[input.segment] ?? 1
  return (
    severityWeight(input.severity) *
    frequencyWeight(input.frequency) *
    reach *
    segment
  )
}
