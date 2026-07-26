'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { VIEWER_COOKIE, type ViewerRole } from '@/core/session'

/** Переключение роли в прототипе. Удаляется в B2 вместе с заглушкой сессии. */
export async function setViewerRole(role: ViewerRole): Promise<void> {
  const jar = await cookies()
  jar.set(VIEWER_COOKIE, role, { sameSite: 'lax', path: '/' })
}

/**
 * Отправка ссылки для входа (FR-172).
 *
 * В фазе A письмо никуда не уходит: почта появится в фазе B вместе с очередью
 * и ретраями (FR-309). Экран «ссылка отправлена» при этом настоящий — это
 * отдельное состояние, а не тост.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim()
  redirect(`/login/sent?email=${encodeURIComponent(email)}`)
}
