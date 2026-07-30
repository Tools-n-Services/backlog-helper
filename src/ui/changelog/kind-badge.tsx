import type { Dictionary } from '@/core/content'
import type { ChangeKind } from '@/queries/types'

/** Названия типов изменений на языке смотрящего (FR-181). */
export function kindNames(t: Dictionary): Record<ChangeKind, string> {
  return {
    new: t.changelog.kindNew,
    improved: t.changelog.kindImproved,
    fixed: t.changelog.kindFixed,
  }
}

/**
 * Тип изменения в релизе (FR-162).
 *
 * Кодируется не цветом: «Новое» — заливка, остальные — контур и вес.
 * В оттенках серого разница обязана оставаться (07-ui-brief.md, раздел 2).
 */
export function KindBadge({ kind, t }: { kind: ChangeKind; t: Dictionary }) {
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
      {kindNames(t)[kind]}
    </span>
  )
}
