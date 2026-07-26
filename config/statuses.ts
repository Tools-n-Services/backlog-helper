/**
 * Публичные статусы обращений. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Статусы — данные, а не enum в коде (02-data-model.md): их набор различается
 * между продуктами. `key` стабилен и используется как имя токена цвета:
 * новый статус обязан получить пару токенов в theme/tokens.css.
 *
 * Состояние кодируется не только цветом (07-ui-brief.md, раздел 2), поэтому
 * у каждого статуса есть `shape` — форма маркера в бейдже. Очередь читают
 * по диагонали, и цветовая разница при этом не считывается.
 */

export type StatusShape = 'dot' | 'ring' | 'half' | 'check' | 'cross' | 'dash'

export interface StatusConfig {
  key: string
  name: string
  /** Форма маркера — второй канал кодирования, помимо цвета. */
  shape: StatusShape
  position: number
  /** Попадает колонкой в Roadmap (FR-152). */
  showOnRoadmap: boolean
  /** «Закрыт»: не показывать в дефолтном фильтре ленты. */
  isTerminal: boolean
  /** Статус нового обращения. Ровно один на набор. */
  isDefault?: boolean
}

export const statuses: StatusConfig[] = [
  {
    key: 'open',
    name: 'Новое',
    shape: 'ring',
    position: 1,
    showOnRoadmap: false,
    isTerminal: false,
    isDefault: true,
  },
  {
    key: 'needs-info',
    name: 'Нужна информация',
    shape: 'half',
    position: 2,
    showOnRoadmap: false,
    isTerminal: false,
  },
  {
    key: 'planned',
    name: 'Запланировано',
    shape: 'dot',
    position: 3,
    showOnRoadmap: true,
    isTerminal: false,
  },
  {
    key: 'building',
    name: 'В работе',
    shape: 'half',
    position: 4,
    showOnRoadmap: true,
    isTerminal: false,
  },
  {
    key: 'completed',
    name: 'Готово',
    shape: 'check',
    position: 5,
    showOnRoadmap: true,
    isTerminal: true,
  },
  {
    key: 'not-reproducible',
    name: 'Не воспроизводится',
    shape: 'cross',
    position: 6,
    showOnRoadmap: false,
    isTerminal: true,
  },
  {
    key: 'duplicate',
    name: 'Дубль',
    shape: 'dash',
    position: 7,
    showOnRoadmap: false,
    isTerminal: true,
  },
  {
    key: 'wont-fix',
    name: 'Не будем делать',
    shape: 'cross',
    position: 8,
    showOnRoadmap: false,
    isTerminal: true,
  },
]

export const statusByKey = new Map(statuses.map((s) => [s.key, s]))

export const defaultStatus =
  statuses.find((s) => s.isDefault) ?? statuses[0]!
