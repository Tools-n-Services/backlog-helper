/**
 * Временная заглушка для экранов, которые появятся в следующих итерациях
 * (см. docs/08-dev-plan.md). Удаляется вместе с реализацией экрана.
 */
export function PlannedScreen({
  title,
  iteration,
  what,
}: {
  title: string
  iteration: string
  what: string
}) {
  return (
    <div className="mx-auto max-w-page px-5 py-20 md:px-8 lg:px-10">
      <p className="font-mono text-label uppercase text-faint">
        Итерация {iteration}
      </p>
      <h1 className="mt-4 text-h2 font-extrabold text-ink">{title}</h1>
      <p className="mt-3 max-w-[56ch] text-body-l text-muted">{what}</p>
    </div>
  )
}
