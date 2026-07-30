import { content } from '@/core/locale'
import { SiteHeader } from '@/ui/layout/site-header'
import { SiteFooter } from '@/ui/layout/site-footer'

/**
 * Публичная поверхность: низкая плотность, читаемый кегль, воздух.
 * Админка живёт под своим layout — её нельзя делать в этом языке
 * (07-ui-brief.md, раздел 1).
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await content()

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-ink focus:px-4 focus:py-2 focus:text-surface"
      >
        {t.nav.skipToContent}
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  )
}
