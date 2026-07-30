'use server'

import { revalidatePath } from 'next/cache'

import { loadCatalog } from '@/core/catalog'
import {
  saveBoards,
  saveStatuses,
  type BoardInput,
  type EditResult,
  type StatusInput,
} from '@/core/domain/settings/catalog-edit'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { loadSettings, saveSetting, type Settings } from '@/core/settings'

/**
 * Правка настроек портала из админки (В5, docs/09-install.md).
 *
 * Каждое действие проверяет право само: серверное действие — такой же вход
 * в приложение, как страница, и «на страницу не пустили» ничего не значит
 * для того, кто вызывает действие напрямую.
 */

async function allowed(): Promise<boolean> {
  return can(await getViewer(), 'settings.edit')
}

const DENIED: EditResult = { ok: false, error: 'Недостаточно прав: настройки правит администратор' }

export interface ProductForm {
  name: string
  mark: string
  domain: string
  locale: 'ru' | 'en'
  features: Settings['features']
  limits: Settings['limits']
  needsInfo: Settings['needsInfo']
  theme: Settings['theme']
}

export async function saveProductAction(form: ProductForm): Promise<EditResult> {
  if (!(await allowed())) return DENIED

  if (!form.name.trim()) return { ok: false, error: 'Название портала не может быть пустым' }
  if (!form.domain.trim()) return { ok: false, error: 'Домен нужен для ссылок в письмах' }

  for (const [key, value] of Object.entries(form.limits)) {
    if (!Number.isInteger(value) || value < 1) {
      return { ok: false, error: `Лимит «${key}»: целое число от 1` }
    }
  }
  for (const [key, value] of Object.entries(form.needsInfo)) {
    if (!Number.isInteger(value) || value < 1) {
      return { ok: false, error: `Срок «${key}»: целое число дней от 1` }
    }
  }
  for (const [key, value] of Object.entries(form.theme)) {
    /* Цвет проверяем строго: в CSS-переменную уезжает то, что записали,
       и «красный» вместо hex тихо обесцветит половину интерфейса. */
    if (!/^#[0-9a-f]{6}$/i.test(value)) {
      return { ok: false, error: `Цвет «${key}»: шестизначный hex вида #1d4ed8` }
    }
  }

  await saveSetting('name', form.name.trim())
  await saveSetting('mark', form.mark.trim() || form.name.trim().slice(0, 1).toUpperCase())
  await saveSetting('domain', form.domain.trim())
  await saveSetting('locale', form.locale)
  await saveSetting('features', form.features)
  await saveSetting('limits', form.limits)
  await saveSetting('needsInfo', form.needsInfo)
  await saveSetting('theme', form.theme)

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function saveBoardsAction(boards: BoardInput[]): Promise<EditResult> {
  if (!(await allowed())) return DENIED

  const result = await saveBoards(boards)
  if (!result.ok) return result

  await loadCatalog()
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function saveStatusesAction(statuses: StatusInput[]): Promise<EditResult> {
  if (!(await allowed())) return DENIED

  const result = await saveStatuses(statuses)
  if (!result.ok) return result

  await loadCatalog()
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Текущие настройки для формы. */
export async function currentSettings(): Promise<Settings> {
  return loadSettings()
}
