import type { Metadata } from 'next'
import { Geologica, IBM_Plex_Mono } from 'next/font/google'

import { product } from '@config/product'
import { locale } from '@/core/locale'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /* Язык смотрящего, а не продукта: `lang` читают скринридеры и встроенный
     переводчик браузера — с чужим значением они переводят уже переведённое. */
  const lang = await locale()

  return (
    <html lang={lang} className={`${geologica.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink-2 antialiased">{children}</body>
    </html>
  )
}
