/**
 * Аватар-заглушка с инициалами. Командный отличается заливкой — это второй
 * канал к текстовому бейджу «команда» (FR-137).
 */
export function Avatar({
  initials,
  isTeam = false,
  size = 'md',
}: {
  initials: string
  isTeam?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden
      className={
        'inline-flex shrink-0 items-center justify-center rounded-pill font-semibold ' +
        (size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-[11px]') +
        (isTeam ? ' bg-ink text-surface' : ' bg-track text-muted')
      }
    >
      {initials}
    </span>
  )
}
