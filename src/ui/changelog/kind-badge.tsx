import type { ChangeKind } from '@/queries/types'

export const KIND_NAMES: Record<ChangeKind, string> = {
  new: 'Новое',
  improved: 'Улучшено',
  fixed: 'Исправлено',
}

/**
 * Тип изменения в релизе (FR-162).
 *
 * Кодируется не цветом: «Новое» — заливка, остальные — контур и вес.
 * В оттенках серого разница обязана оставаться (07-ui-brief.md, раздел 2).
 */
export function KindBadge({ kind }: { kind: ChangeKind }) {
  const style =
    kind === 'new'
      ? 'bg-ink text-surface'
      : kind === 'improved'
        ? 'border border-ink text-ink'
        : 'bg-track text-muted'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 font-mono text-label uppercase ${style}`}
    >
      {KIND_NAMES[kind]}
    </span>
  )
}
