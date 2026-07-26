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

export interface PriorityInput {
  severity: SeverityKey | null
  frequency: FrequencyKey | null
  affectedCount: number
  /** Сегмент репортера: enterprise / paid / free. */
  segment: string
}

export function severityWeight(key: SeverityKey | null): number {
  return severities.find((s) => s.key === key)?.weight ?? 1
}

export function frequencyWeight(key: FrequencyKey | null): number {
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
