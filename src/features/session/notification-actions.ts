'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/core/db'
import {
  NOTIFICATION_KINDS,
  readPrefs,
  type NotificationPrefs,
} from '@/core/domain/post/notification-prefs'
import { getViewer } from '@/core/session'

/**
 * Сохранение настроек писем (FR-307).
 *
 * Обычная форма с серверным действием: настройки — не то место, где нужна
 * мгновенная реакция без перезагрузки, зато нужна уверенность, что сохранилось.
 */
export async function saveNotificationPrefs(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.signedIn) return

  /* Незачёкнутый флажок в форму не попадает вовсе — поэтому собираем
     значения по известному списку, а не по тому, что пришло. */
  const prefs = Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [kind.key, formData.get(kind.key) === 'on']),
  ) as NotificationPrefs

  await prisma.appUser.update({
    where: { id: viewer.id },
    data: { notificationPrefs: prefs },
  })

  revalidatePath('/profile')
}

/** Текущие настройки: всё, чего нет в базе, берётся из умолчания. */
export async function currentNotificationPrefs(): Promise<NotificationPrefs> {
  const viewer = await getViewer()
  if (!viewer.signedIn) return readPrefs({})

  const user = await prisma.appUser.findUnique({
    where: { id: viewer.id },
    select: { notificationPrefs: true },
  })
  return readPrefs(user?.notificationPrefs)
}
