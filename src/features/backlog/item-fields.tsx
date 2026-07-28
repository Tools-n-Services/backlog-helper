import type { InternalStatusOption, ThemeOption } from '@/core/domain/backlog/options'
import { backlogKinds } from '@config/internal-statuses'
import type { BacklogItemView } from '@/queries/types'

/**
 * Поля элемента бэклога — общие для создания и правки.
 *
 * Обычная форма без клиентского состояния: полей немного, а после
 * сохранения страницу всё равно нужно перечитать.
 */
export function ItemFields({
  item,
  themes,
  statuses,
}: {
  item?: BacklogItemView
  themes: ThemeOption[]
  statuses?: InternalStatusOption[]
}) {
  return (
    <div className="grid gap-3">
      <Field label="Название работы" hint="Внутреннее: как это называет команда">
        <input
          name="title"
          required
          minLength={3}
          defaultValue={item?.title ?? ''}
          className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-body text-ink"
        />
      </Field>

      <Field
        label="Проблема"
        hint="Что не работает у людей, а не какое решение мы придумали"
      >
        <textarea
          name="problem"
          rows={3}
          defaultValue={item?.problem ?? ''}
          className="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-body text-ink-2"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип">
          <select
            name="kind"
            defaultValue={item?.kind ?? 'feature'}
            className="h-8 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2"
          >
            {backlogKinds.map((kind) => (
              <option key={kind.key} value={kind.key}>
                {kind.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Тема">
          <select
            name="themeId"
            defaultValue={themes.find((t) => t.slug === item?.themeSlug)?.id ?? ''}
            className="h-8 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2"
          >
            <option value="">Без темы</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {statuses && (
        <>
          {/* Этап — на всю ширину: названия длинные, а колонка карточки узкая,
              и в трети ширины «Готово к работе» превращается в обрубок. */}
          <Field label="Этап" hint={hintFor(statuses, item?.statusKey)}>
            <select
              name="statusKey"
              defaultValue={item?.statusKey ?? ''}
              className="h-8 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2"
            >
              {statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Оценка">
              <input
                name="estimate"
                defaultValue={item?.estimate ?? ''}
                placeholder="M"
                className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
              />
            </Field>

            <Field label="Целевой выпуск">
              <input
                name="targetRelease"
                defaultValue={item?.targetRelease ?? ''}
                placeholder="2026.Q4"
                className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
              />
            </Field>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Пояснение к текущему этапу.
 *
 * «Проверка» и «Исследуем» понимают по-разному даже внутри одной команды,
 * а от этого зависит, увидит ли пользователь смену статуса.
 */
function hintFor(statuses: InternalStatusOption[], key: string | null | undefined) {
  return statuses.find((s) => s.key === key)?.hint
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-small font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-small text-faint">{hint}</span>}
    </label>
  )
}
