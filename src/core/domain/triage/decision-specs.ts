/**
 * Набор решений очереди триажа (FR-532).
 *
 * Отдельный модуль без единого импорта из инфраструктуры — и это не вопрос
 * вкуса: очередь работает в браузере, а решения ей нужны, чтобы нарисовать
 * панель. Лежи они рядом с мутациями, в клиентскую сборку уехал бы драйвер
 * Postgres со всей его зависимостью от `dns` и `net`.
 *
 * Ключ — то, что жмёт оператор; остальное — последствия в данных.
 * Причина обязательна там, где решение отказное: человек, чьё обращение
 * закрыли молча, второй раз не напишет (FR-535).
 */

export interface DecisionSpec {
  key: string
  label: string
  /** Публичный статус, в который переходит обращение. */
  statusKey: string
  /** Итог для отчётности. null — обращение остаётся в работе. */
  resolution: 'fixed' | 'duplicate' | 'not_reproducible' | 'by_design' | 'wont_fix' | null
  /** Причина уходит репортеру письмом и обязательна к заполнению. */
  needsReason: boolean
  /** Обращение начинает ждать ответа автора (FR-533). */
  awaitsReporter?: boolean
  /** Заводит элемент бэклога из обращения, если его ещё нет (FR-603). */
  createsBacklogItem?: boolean
}

export const DECISIONS: DecisionSpec[] = [
  {
    key: 'confirm',
    label: 'Подтвердить',
    statusKey: 'planned',
    resolution: null,
    needsReason: false,
  },
  {
    key: 'needs-info',
    label: 'Запросить информацию',
    statusKey: 'needs-info',
    resolution: null,
    needsReason: true,
    awaitsReporter: true,
  },
  {
    key: 'not-reproducible',
    label: 'Не воспроизводится',
    statusKey: 'not-reproducible',
    resolution: 'not_reproducible',
    needsReason: true,
  },
  {
    key: 'by-design',
    label: 'Так задумано',
    statusKey: 'wont-fix',
    resolution: 'by_design',
    needsReason: true,
  },
  {
    key: 'duplicate',
    label: 'Дубликат',
    statusKey: 'duplicate',
    resolution: 'duplicate',
    needsReason: false,
  },
  {
    key: 'wont-fix',
    label: 'Не будем делать',
    statusKey: 'wont-fix',
    resolution: 'wont_fix',
    needsReason: true,
  },
  {
    key: 'backlog',
    label: 'В бэклог',
    statusKey: 'planned',
    resolution: null,
    needsReason: false,
    createsBacklogItem: true,
  },
]

export const decisionByKey = new Map(DECISIONS.map((d) => [d.key, d]))
