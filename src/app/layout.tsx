import type { Metadata } from 'next'
import { Geologica, IBM_Plex_Mono } from 'next/font/google'

import { catalog, loadCatalog } from '@/core/catalog'
import { locale } from '@/core/locale'
import { loadSettings, settings } from '@/core/settings'
import { paletteEntry } from '@config/theme'

import './globals.css'

/* Шрифты самохостятся сборкой — портал должен работать без обращения к CDN. */
const geologica = Geologica({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-geologica',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/**
 * Метаданные считаются на запрос, а не при импорте модуля: название и домен
 * живут в настройках и меняются без пересборки (В2, docs/09-install.md).
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSettings()
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: {
      default: `${site.name} — обратная связь`,
      template: `%s · ${site.name}`,
    },
    description:
      'Портал обратной связи: предложения, сообщения об ошибках и то, что мы делаем дальше.',
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /* Язык смотрящего, а не продукта: `lang` читают скринридеры и встроенный
     переводчик браузера — с чужим значением они переводят уже переведённое. */
  const [lang] = await Promise.all([locale(), loadCatalog()])

  return (
    <html lang={lang} className={`${geologica.variable} ${plexMono.variable}`}>
      <head>
        {/* Цвета из настроек — переменными поверх theme/tokens.css. Так статус,
            заведённый в админке, получает пару «фон + текст» наравне
            со встроенными: раньше пары жили в сборке, и новый статус
            оставался серым до следующей выкладки. */}
        <style>{themeVariables()}</style>
      </head>
      <body className="min-h-dvh bg-paper text-ink-2 antialiased">{children}</body>
    </html>
  )
}

function themeVariables(): string {
  const { theme } = settings()

  const lines = [
    `--color-ink:${theme.ink};`,
    `--color-ink-hover:${theme.inkHover};`,
    ...catalog().statuses.flatMap((status) => {
      const entry = paletteEntry(status.color)
      return [
        `--color-status-${status.key}-bg:${entry.bg};`,
        `--color-status-${status.key}-fg:${entry.fg};`,
      ]
    }),
  ]

  return `:root{${lines.join('')}}`
}
