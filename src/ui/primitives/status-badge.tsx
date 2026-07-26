import type { StatusShape } from '@config/statuses'
import type { StatusView } from '@/queries/types'

/**
 * Бейдж статуса.
 *
 * Цвет приходит из токена по `status.key` — ни одного значения в компоненте
 * (07-ui-brief.md, раздел 2). Рядом с цветом всегда есть форма маркера:
 * состояние обязано читаться в оттенках серого.
 */

function ShapeMark({ shape }: { shape: StatusShape }) {
  const common = { width: 9, height: 9, viewBox: '0 0 12 12', 'aria-hidden': true }
  switch (shape) {
    case 'dot':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5" fill="currentColor" />
        </svg>
      )
    case 'ring':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'half':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M6 1.8a4.2 4.2 0 0 1 0 8.4z" fill="currentColor" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path
            d="M2 6.4 4.8 9.2 10 3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'cross':
      return (
        <svg {...common}>
          <path
            d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'dash':
      return (
        <svg {...common}>
          <path d="M2.2 6h7.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
  }
}

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: StatusView
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill font-semibold ' +
        (size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-small')
      }
      style={{
        background: `var(--color-status-${status.key}-bg, var(--color-track))`,
        color: `var(--color-status-${status.key}-fg, var(--color-muted))`,
      }}
    >
      <ShapeMark shape={status.shape} />
      {status.name}
    </span>
  )
}
