import { product } from '@config/product'
import { t } from '@/core/content'
import { getViewer } from '@/core/session'
import { ViewerSwitcher } from '@/features/session/viewer-switcher'

export async function SiteFooter() {
  const viewer = await getViewer()

  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 font-mono text-label uppercase text-faint md:px-8 lg:px-10">
        <span>
          {product.name} · {t.footer.poweredBy}
        </span>
        <span className="ml-auto">{product.domain}</span>
      </div>
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-3 border-t border-line px-5 py-4 md:px-8 lg:px-10">
        <ViewerSwitcher current={viewer.role} />
      </div>
    </footer>
  )
}
