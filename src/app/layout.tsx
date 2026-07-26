import type { Metadata } from 'next'
import { Geologica, IBM_Plex_Mono } from 'next/font/google'

import { product } from '@config/product'
import { t } from '@/core/content'
import { SiteHeader } from '@/ui/layout/site-header'
import { SiteFooter } from '@/ui/layout/site-footer'

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

export const metadata: Metadata = {
  metadataBase: new URL(`https://${product.domain}`),
  title: {
    default: `${product.name} — обратная связь`,
    template: `%s · ${product.name}`,
  },
  description:
    'Портал обратной связи: предложения, сообщения об ошибках и то, что мы делаем дальше.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang={product.locale} className={`${geologica.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink-2 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-ink focus:px-4 focus:py-2 focus:text-surface"
        >
          {t.nav.skipToContent}
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
