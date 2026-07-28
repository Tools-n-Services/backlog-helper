'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { requestSignInLink, signInUrl, signOut } from '@/core/auth'
import { deliverSignInLink } from '@/core/mail'

/**
 * Отправка ссылки для входа (FR-172).
 *
 * Экран «ссылка отправлена» показывается одинаково для существующего
 * и несуществующего адреса — иначе форма входа становится способом узнать,
 * зарегистрирован ли человек на портале. Единственное исключение —
 * превышение частоты: молчать о нём значит оставить человека нажимать
 * кнопку и гадать, почему письма нет.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim()
  const result = await requestSignInLink(email)

  if (!result.ok && result.reason === 'rate-limited') {
    redirect(`/login?error=rate-limited&email=${encodeURIComponent(email)}`)
  }
  if (!result.ok) {
    redirect(`/login?error=invalid-email&email=${encodeURIComponent(email)}`)
  }

  const origin = await currentOrigin()
  const sent = await deliverSignInLink(result.email, signInUrl(result.token, origin))

  /* Письмо не ушло — говорим об этом. Экран «проверьте почту» там,
     где почты не будет, отправляет человека ждать впустую. */
  if (!sent.ok) {
    console.error('Не удалось отправить ссылку входа:', sent.error)
    redirect(`/login?error=mail-failed&email=${encodeURIComponent(email)}`)
  }

  redirect(`/login/sent?email=${encodeURIComponent(result.email)}`)
}

export async function signOutAction(): Promise<void> {
  await signOut()
  redirect('/')
}

async function currentOrigin(): Promise<string> {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
