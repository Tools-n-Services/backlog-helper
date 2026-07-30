'use server'

import { cookies } from 'next/headers'

import { openSession } from '@/core/auth'
import {
  completeInstall,
  installToken,
  isInstalled,
  INSTALL_COOKIE,
  type InstallInput,
} from '@/core/install'
import { deliverSignInLink } from '@/core/mail'

/**
 * Действия мастера установки (В4, docs/09-install.md).
 *
 * Каждое проверяет ворота само: серверное действие — такой же вход
 * в приложение, как страница, и «на страницу не пустили» ничего не значит
 * для того, кто вызывает действие напрямую.
 */

async function allowed(): Promise<boolean> {
  const token = installToken()
  if (!token) return false
  if (await isInstalled()) return false
  return (await cookies()).get(INSTALL_COOKIE)?.value === token
}

export type TestLetterResult = { ok: true } | { ok: false; error: string }

/**
 * Пробное письмо на адрес будущего владельца.
 *
 * Настроенный канал почты — единственный способ входа в портал, и проверять
 * его после установки поздно: чинить настройки можно только войдя.
 */
export async function sendTestLetterAction(email: string): Promise<TestLetterResult> {
  if (!(await allowed())) return { ok: false, error: 'Мастер закрыт' }

  const address = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
    return { ok: false, error: 'Проверьте адрес' }
  }

  const origin = process.env.PORTAL_ORIGIN ?? 'http://localhost:3000'
  const result = await deliverSignInLink(address, `${origin}/install`)
  if (result.ok) {
    return result.skipped
      ? { ok: false, error: 'Адрес из зарезервированного домена — письмо не отправлялось' }
      : { ok: true }
  }
  return { ok: false, error: result.error }
}

export type CompleteResult =
  | { ok: true }
  | { ok: false; error: string }

export async function completeInstallAction(input: InstallInput): Promise<CompleteResult> {
  if (!(await allowed())) return { ok: false, error: 'Мастер закрыт' }

  const result = await completeInstall(input)
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === 'already-installed'
          ? 'Портал уже установлен'
          : (result.message ?? 'Проверьте поля'),
    }
  }

  /* Владелец входит сразу, а не по письму: иначе неверно настроенная почта
     запирает свежий портал — войти некому, а починить настройки можно
     только войдя. Ворота мастера этот вход уже защитили. */
  await openSession(result.ownerId)

  const store = await cookies()
  store.delete(INSTALL_COOKIE)
  return { ok: true }
}
