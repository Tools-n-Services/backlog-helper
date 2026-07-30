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

/* ────────────────────── Приоритизация бэклога ────────────────────── */

/**
 * Влияние: насколько сильно решение меняет жизнь затронутых (FR-611).
 *
 * Значения дробные и убывают быстро — так и задумано. Разница между
 * «массово» и «заметно» должна перевешивать разницу в охвате вдвое,
 * иначе побеждает всё, о чём просто громче просят.
 */
export const impacts: { value: number; name: string; hint: string }[] = [
  { value: 3, name: 'Массовое', hint: 'Меняет ежедневную работу большинства' },
  { value: 2, name: 'Сильное', hint: 'Убирает регулярную боль' },
  { value: 1, name: 'Заметное', hint: 'Ощутимо, но не каждый день' },
  { value: 0.5, name: 'Небольшое', hint: 'Приятно, обходной путь есть' },
  { value: 0.25, name: 'Минимальное', hint: 'Косметика' },
]

/**
 * Уверенность в оценке.
 *
 * Множитель существует ради честности: без него оценка «по ощущениям»
 * конкурирует наравне с посчитанной по данным, и выигрывает та,
 * у которой смелее цифры.
 */
export const confidences: { value: number; name: string; hint: string }[] = [
  { value: 1, name: 'Высокая', hint: 'Есть данные и разговоры с клиентами' },
  { value: 0.8, name: 'Средняя', hint: 'Спрос понятен, деталей не хватает' },
  { value: 0.5, name: 'Низкая', hint: 'Догадка команды' },
]

export interface ScoreInput {
  /** Считается, а не вводится: уникальные затронутые с весами (FR-612). */
  reach: number
  impact: number | null
  confidence: number | null
  /** Оценка работы в человеко-неделях. */
  effort: number | null
}

/**
 * Формула приоритета. ФОРК МЕНЯЕТ ЭТУ ФУНКЦИЮ (FR-614).
 *
 * RICE по умолчанию. Компоненты хранятся отдельными колонками, а итог —
 * вычисляемое поле: смена формулы не должна требовать миграции и не должна
 * терять исходные оценки, по которым решение однажды приняли.
 *
 * null означает «нечем считать», а не ноль. Ноль встал бы в конец
 * ранжированного списка наравне с осознанно отложенным, и работа без оценки
 * молча исчезла бы из поля зрения — а её как раз нужно оценить.
 */
export const scoreFormula = {
  name: 'RICE',
  hint: 'Охват × Влияние × Уверенность ÷ Оценка',
  compute({ reach, impact, confidence, effort }: ScoreInput): number | null {
    if (impact === null || confidence === null || effort === null) return null
    if (effort <= 0) return null

    /* Нулевой охват — не нулевая ценность. Техдолг, миграция и требование
       регулятора не имеют ни голосов, ни цитат: их никто не просил, и RICE
       про них сказать нечего. Ноль здесь звучал бы как «ничего не даст»
       и задвигал бы такую работу в конец любой сортировки — а она решается
       ручным рангом (FR-615), а не расчётом. */
    if (reach <= 0) return null

    return (reach * impact * confidence) / effort
  },
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
