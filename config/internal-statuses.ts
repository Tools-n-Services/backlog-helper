/**
 * Внутренние статусы бэклога. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Это НЕ те статусы, что видит пользователь. Публичных — восемь и они про
 * судьбу его обращения; внутренних столько, сколько этапов у команды,
 * и они про её работу.
 *
 * Ключевая часть — `publicStatusKey`: отображение внутреннего состояния
 * на публичное (FR-632). Оно одностороннее и намеренно неполное. У этапов
 * `discovery`, `review` публичного соответствия нет вовсе — и это главное,
 * ради чего разделение вообще существует: переходы между ними пользователю
 * не видны и писем не рассылают. Иначе на активной задаче человек получит
 * пять писем за неделю и отпишется навсегда (FR-634).
 */

export interface InternalStatusConfig {
  key: string
  name: string
  /** Пояснение для доски: что значит «в проверке» — знает не каждый. */
  hint: string
  position: number
  /** Работа закончена: элемент уходит из активного бэклога. */
  isTerminal: boolean
  /** Статус нового элемента. Ровно один на набор. */
  isDefault?: boolean
  /**
   * Публичный статус связанных обращений при переходе сюда.
   * null — переход внутренний, пользователю не видим и писем не рассылает.
   */
  publicStatusKey: string | null
}

export const internalStatuses: InternalStatusConfig[] = [
  {
    key: 'inbox',
    name: 'Разобрать',
    hint: 'Работа сформулирована, но ещё не оценена и не поставлена в очередь',
    position: 1,
    isTerminal: false,
    isDefault: true,
    /* Ничего не обещаем: попадание в бэклог — не обещание сделать. */
    publicStatusKey: null,
  },
  {
    key: 'discovery',
    name: 'Исследуем',
    hint: 'Разбираемся, в чём именно проблема и стоит ли её решать',
    position: 2,
    isTerminal: false,
    publicStatusKey: null,
  },
  {
    key: 'ready',
    name: 'Готово к работе',
    hint: 'Решение выбрано, оценка есть, ждёт очереди',
    position: 3,
    isTerminal: false,
    /* Первое, что стоит сказать пользователю: мы это сделаем. */
    publicStatusKey: 'planned',
  },
  {
    key: 'in-progress',
    name: 'В работе',
    hint: 'Кто-то делает это прямо сейчас',
    position: 4,
    isTerminal: false,
    publicStatusKey: 'building',
  },
  {
    key: 'review',
    name: 'Проверка',
    hint: 'Сделано, проверяется. Для пользователя ничего не изменилось',
    position: 5,
    isTerminal: false,
    /* Публично всё ещё «в работе»: релиза не было, и письмо о переходе
       в проверку человеку ничего не даёт. */
    publicStatusKey: null,
  },
  {
    key: 'released',
    name: 'Выпущено',
    hint: 'Вышло к пользователям — обращения закрываются, авторам уходят письма',
    position: 6,
    isTerminal: true,
    publicStatusKey: 'completed',
  },
  {
    key: 'dropped',
    name: 'Отказались',
    hint: 'Решили не делать. Причина уходит всем, кто голосовал',
    position: 7,
    isTerminal: true,
    publicStatusKey: 'wont-fix',
  },
]

export const internalStatusByKey = new Map(internalStatuses.map((s) => [s.key, s]))

export const defaultInternalStatus =
  internalStatuses.find((s) => s.isDefault) ?? internalStatuses[0]!

/** Типы работы. Техдолг конкурирует за приоритет наравне с запросами (FR-605). */
export const backlogKinds = [
  { key: 'feature', name: 'Функция' },
  { key: 'bug', name: 'Ошибка' },
  { key: 'tech', name: 'Техдолг' },
  { key: 'compliance', name: 'Требование' },
] as const

export type BacklogKindKey = (typeof backlogKinds)[number]['key']

export const backlogKindName = (key: string): string =>
  backlogKinds.find((k) => k.key === key)?.name ?? key
