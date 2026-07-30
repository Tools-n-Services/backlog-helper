/**
 * Справочники для форм бэклога.
 *
 * Живут отдельно от `queries`: порт чтения описывает то, что видит
 * пользователь портала, а это — служебные списки для выпадашек админки.
 * Тащить их в публичный контракт значит расширять его ради одной формы.
 */

import { catalog, loadCatalog } from '@/core/catalog'
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
 * Внутренние этапы в порядке работы.
 *
 * Источник — база: набор этапов и их привязка к публичным статусам правятся
 * в админке, а не выкладкой (В1, docs/09-install.md).
 */
export async function listInternalStatuses(): Promise<InternalStatusOption[]> {
  await loadCatalog()
  const { internalStatuses, statusByKey } = catalog()

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
