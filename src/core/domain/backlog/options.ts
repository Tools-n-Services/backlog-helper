/**
 * Справочники для форм бэклога.
 *
 * Живут отдельно от `queries`: порт чтения описывает то, что видит
 * пользователь портала, а это — служебные списки для выпадашек админки.
 * Тащить их в публичный контракт значит расширять его ради одной формы.
 */

import { internalStatuses } from '@config/internal-statuses'
import { statusByKey } from '@config/statuses'
import { prisma } from '@/core/db'

export interface ThemeOption {
  id: string
  name: string
  slug: string
}

export async function listThemes(): Promise<ThemeOption[]> {
  return prisma.theme.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })
}

export interface InternalStatusOption {
  key: string
  name: string
  hint: string
  isTerminal: boolean
  /**
   * Публичный статус, в который уйдут связанные обращения. null — переход
   * внутренний: пользователь его не увидит и письма не получит (FR-634).
   */
  publicStatusName: string | null
}

/**
 * Внутренние статусы в порядке этапов.
 *
 * Источник — конфиг, а не база: набор статусов правит форк файлом, а строки
 * в базе только дают им идентификаторы для внешних ключей.
 */
export function listInternalStatuses(): InternalStatusOption[] {
  return internalStatuses
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(({ key, name, hint, isTerminal, publicStatusKey }) => ({
      key,
      name,
      hint,
      isTerminal,
      publicStatusName: publicStatusKey
        ? (statusByKey.get(publicStatusKey)?.name ?? publicStatusKey)
        : null,
    }))
}
