/**
 * Скелет структуры, а не спиннер: лента должна сохранять форму, пока грузится
 * (07-ui-brief.md, разделы 5 и 9).
 *
 * Живёт внутри страницы, а не в loading.tsx сегмента: loading.tsx подменяет
 * скелетом весь экран, включая заголовок доски и её описание. Внутри страницы
 * Suspense оборачивает только выборку, и при переходе сразу видно, куда попал.
 */
export function FeedSkeleton() {
  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[212px_minmax(0,1fr)]">
        <div className="space-y-6">
          {[0, 1, 2].map((group) => (
            <div key={group}>
              <div className="mb-3 h-3 w-20 animate-pulse rounded-pill bg-track" />
              <div className="space-y-2">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-5 animate-pulse rounded-pill bg-track" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-4 h-9 border-b border-line" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((card) => (
              <div
                key={card}
                className="flex gap-4 rounded-card border border-line bg-surface p-4"
              >
                <div className="h-[74px] w-[74px] shrink-0 animate-pulse rounded-card bg-track" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-5 w-52 animate-pulse rounded-pill bg-track" />
                  <div className="h-5 w-3/4 animate-pulse rounded-pill bg-track" />
                  <div className="h-4 w-full animate-pulse rounded-pill bg-track" />
                  <div className="h-4 w-2/3 animate-pulse rounded-pill bg-track" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
