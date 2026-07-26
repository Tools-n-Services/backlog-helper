/**
 * Приоритизация и SLA. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Формула автооценки приоритета (FR-531) и политики SLA (FR-538) —
 * данные, а не код: у разных продуктов и severity значит разное,
 * и сроки первого ответа разные.
 *
 * Автооценка — вход в разговор, а не приговор: приоритет команды (`P0..P3`)
 * остаётся отдельным полем, которое ставит человек (FR-536, 06-backlog.md §8).
 */

export type SeverityKey = 'blocker' | 'major' | 'minor'
export type FrequencyKey = 'always' | 'sometimes' | 'once'

export interface SeverityConfig {
  key: SeverityKey
  name: string
  /** Короткая форма для плотной очереди. */
  short: string
  weight: number
}

export const severities: SeverityConfig[] = [
  { key: 'blocker', name: 'Блокирует работу', short: 'блок', weight: 3 },
  { key: 'major', name: 'Мешает, есть обходной путь', short: 'мешает', weight: 2 },
  { key: 'minor', name: 'Косметика', short: 'косм', weight: 1 },
]

export const frequencies: { key: FrequencyKey; name: string; weight: number }[] = [
  { key: 'always', name: 'Каждый раз', weight: 1 },
  { key: 'sometimes', name: 'Иногда', weight: 0.6 },
  { key: 'once', name: 'Один раз', weight: 0.3 },
]

/** Вес сегмента репортера. Без него громкие важнее платящих (FR-612). */
export const segmentWeights: Record<string, number> = {
  enterprise: 5,
  paid: 2,
  free: 1,
}

/** Приоритет команды. Отдельная ось от severity репортера. */
export const priorities: { key: string; name: string; hint: string }[] = [
  { key: 'p0', name: 'P0', hint: 'Бросаем всё' },
  { key: 'p1', name: 'P1', hint: 'В текущий цикл' },
  { key: 'p2', name: 'P2', hint: 'В бэклог с высоким рангом' },
  { key: 'p3', name: 'P3', hint: 'Когда дойдут руки' },
]

export interface SlaPolicy {
  /** Тип обращения; null — любой. */
  typeKey: string | null
  /** Severity; null — любая. */
  severity: SeverityKey | null
  /** Часы до первого ответа. */
  firstResponseHours: number
}

/**
 * Политики SLA первого ответа. Ищется первая подходящая сверху вниз,
 * поэтому частные правила стоят выше общих.
 *
 * Правила «на всё остальное» здесь нет намеренно: у идей срока первого
 * ответа не бывает. Обещание ответить на каждое предложение за N часов
 * невыполнимо, а очередь, где просрочено всё подряд, перестаёт быть
 * инструментом — в ней не видно того, что действительно горит.
 * Обращения без политики попадают в очередь без таймера.
 */
export const slaPolicies: SlaPolicy[] = [
  { typeKey: 'bug', severity: 'blocker', firstResponseHours: 4 },
  { typeKey: 'bug', severity: 'major', firstResponseHours: 24 },
  { typeKey: 'bug', severity: 'minor', firstResponseHours: 72 },
  { typeKey: 'bug', severity: null, firstResponseHours: 48 },
  { typeKey: 'question', severity: null, firstResponseHours: 24 },
]

/** За сколько часов до срока таймер переходит в состояние «скоро». */
export const slaWarningHours = 4
