'use server'

import { revalidatePath } from 'next/cache'

import { invalidateCatalog, loadCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'
import { checkSchema, type SchemaProblem } from '@/core/domain/intake/form-schema'
import { can } from '@/core/permissions'
import { getViewer } from '@/core/session'
import type { FormField } from '@config/post-types'

/**
 * Правка схемы формы (В3, docs/09-install.md).
 *
 * Здесь проходит граница, которой раньше не было: схему правит человек,
 * а не компилятор, и неверная схема — это сломанная форма у живых людей.
 * Поэтому проверка идёт до записи и говорит, что именно не так, — а не
 * после, когда чинить уже поздно.
 */

export type SaveSchemaResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'not-found' }
  | { ok: false; reason: 'invalid'; problems: SchemaProblem[] }

export async function saveSchemaAction(
  typeKey: string,
  fields: unknown,
): Promise<SaveSchemaResult> {
  const viewer = await getViewer()
  /* Схема формы решает, что портал спрашивает у всех и что попадает
     в приватную диагностику: это право уровня настроек, а не модерации. */
  if (!can(viewer, 'settings.edit')) return { ok: false, reason: 'forbidden' }

  const checked = checkSchema(fields)
  if (!checked.ok) return { ok: false, reason: 'invalid', problems: checked.problems }

  const type = await prisma.postType.findUnique({
    where: { key: typeKey },
    select: { id: true },
  })
  if (!type) return { ok: false, reason: 'not-found' }

  await prisma.postType.update({
    where: { id: type.id },
    data: { formSchema: checked.fields as never },
  })

  /* Сбрасываем снимок сразу: человек, который только что сохранил форму,
     обязан увидеть её на портале, а не через время жизни кеша. */
  invalidateCatalog()
  await loadCatalog()
  revalidatePath('/', 'layout')

  return { ok: true }
}

/** Текущая схема типа — для редактора. */
export async function currentSchema(typeKey: string): Promise<FormField[]> {
  await loadCatalog()
  const { catalog } = await import('@/core/catalog')
  return catalog().typeByKey.get(typeKey)?.formSchema ?? []
}
