import type { Metadata } from 'next'

import { product } from '@config/product'
import { requestMagicLink } from '@/features/session/actions'

export const metadata: Metadata = { title: 'Вход' }

/**
 * Вход по ссылке из письма (FR-172).
 *
 * Пароля нет намеренно: портал фидбэка — не то место, ради которого заводят
 * ещё один пароль, а забытый пароль стоит команде обращения в поддержку.
 */
const ERRORS: Record<string, string> = {
  'invalid-email': 'Проверьте адрес: похоже, в нём опечатка.',
  'rate-limited':
    'Мы уже отправили несколько ссылок на этот адрес. Проверьте почту, включая «Спам», — новую можно запросить через час.',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const error = first('error')
  const message = error ? ERRORS[error] : null

  return (
    <div className="mx-auto max-w-page px-5 py-20 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[38rem]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-surface">
            {product.mark}
          </span>
          <span className="text-body font-semibold text-ink">{product.name}</span>
        </div>

        <h1 className="text-h1 font-light text-ink md:text-display">
          Вход <span className="font-extrabold">без пароля</span>
        </h1>
        <p className="mt-5 text-body-l text-muted">
          Пришлём ссылку на почту — она действует 15 минут и открывает вход
          в один клик.
        </p>

        {message && (
          <p
            role="alert"
            className="mt-7 rounded-field border border-line bg-surface-2 px-4 py-3 text-small text-ink-2"
          >
            {message}
          </p>
        )}

        <form action={requestMagicLink} className="mt-9">
          <label
            htmlFor="email"
            className="mb-1.5 block text-body font-semibold text-ink"
          >
            Рабочая почта
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            /* Адрес возвращается в поле: заставлять набирать его заново
               после отказа — верный способ получить вторую опечатку. */
            defaultValue={first('email') ?? ''}
            placeholder={`имя@${product.domain}`}
            className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-body text-ink-2 placeholder:text-faint"
          />
          <button
            type="submit"
            className="mt-4 rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover"
          >
            Получить ссылку
          </button>
        </form>

        <p className="mt-8 border-t border-line pt-5 text-small text-faint">
          Голосовать и комментировать можно только после входа. Читать портал —
          без него.
        </p>
      </div>
    </div>
  )
}
