import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import {
  checkEnvironment,
  installToken,
  isInstalled,
  INSTALL_COOKIE,
  presets,
} from '@/core/install'
import { mailProvider } from '@/core/mail'
import { defaultSettings } from '@/core/settings'
import { InstallWizard } from '@/features/install/wizard'

export const metadata: Metadata = { title: 'Установка', robots: { index: false } }

/**
 * Мастер первого запуска (В4, docs/09-install.md).
 *
 * Ворота двойные: установка не завершена **и** предъявлен `INSTALL_TOKEN`.
 * Токена нет в среде — мастера нет вовсе: свежий портал в интернете находят
 * сканеры за минуты, и открытая страница установки отдаёт им и сайт, и базу.
 *
 * Признак завершения — ключ `installed_at`, а не наличие владельца:
 * владельца можно случайно удалить, и портал с живыми данными снова открыл бы
 * установку постороннему.
 */
export default async function InstallPage() {
  const token = installToken()
  if (!token || (await isInstalled())) notFound()

  /* Токен предъявляется маршруту /install/enter, который кладёт его в куку:
     во время рендера страницы куку ставить нельзя. */
  if ((await cookies()).get(INSTALL_COOKIE)?.value !== token) notFound()

  const [checks, defaults] = await Promise.all([checkEnvironment(), defaultSettings()])

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-14 md:px-8">
      <InstallWizard
        checks={checks}
        presets={presets}
        mail={mailProvider()}
        defaults={{
          name: defaults.name,
          mark: defaults.mark,
          domain: defaults.domain,
          locale: defaults.locale,
        }}
      />
    </div>
  )
}
