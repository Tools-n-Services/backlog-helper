import { product } from '@config/product'
import { t } from '@/core/content'

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 font-mono text-label uppercase text-faint md:px-8 lg:px-10">
        <span>
          {product.name} · {t.footer.poweredBy}
        </span>
        <span className="ml-auto">{product.domain}</span>
      </div>
    </footer>
  )
}
