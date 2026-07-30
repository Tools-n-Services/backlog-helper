import type { InternalStatusOption, ThemeOption } from '@/core/domain/backlog/options'
import { backlogKinds } from '@config/internal-statuses'
import { confidences, impacts, scoreFormula } from '@config/scoring'
import type { BacklogItemDetailView } from '@/queries/types'

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
  item?: BacklogItemDetailView
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
              {/* Публичное следствие — в самой подписи варианта, а не в тексте
                  рядом: этап выбирают один раз и в этот момент решают судьбу
                  чужого обращения. Стрелка отвечает на вопрос «увидит ли это
                  пользователь» до сохранения, а не после (FR-632, FR-634). */}
              {statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.publicStatusName && status.publicStatusName !== status.name
                    ? `${status.name} → ${status.publicStatusName}`
                    : status.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Публичная причина"
            hint="Уходит письмом всем, кто голосовал, когда работа выпущена или отклонена"
          >
            <textarea
              name="decisionReasonPublic"
              rows={2}
              defaultValue={item?.decisionReasonPublic ?? ''}
              className="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2"
            />
          </Field>

          {/* Компоненты приоритета. Охвата среди них нет намеренно: он
              считается из голосов и инсайтов, а поле «Reach», которое
              заполняют руками, показывает лишь то, во что верит
              заполнявший (FR-612). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Влияние" hint={hintOf(impacts, item?.impact)}>
              <select
                name="impact"
                defaultValue={item?.impact ?? ''}
                className="h-8 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2"
              >
                <option value="">Не оценено</option>
                {impacts.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Уверенность" hint={hintOf(confidences, item?.confidence)}>
              <select
                name="confidence"
                defaultValue={item?.confidence ?? ''}
                className="h-8 w-full rounded-field border border-line bg-surface px-2 text-small text-ink-2"
              >
                <option value="">Не оценена</option>
                {confidences.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Оценка работы, недели"
            hint={`Знаменатель формулы: ${scoreFormula.hint.toLowerCase()}`}
          >
            <input
              name="effort"
              type="number"
              step="0.5"
              min="0"
              defaultValue={item?.effort ?? ''}
              placeholder="2"
              className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Размер">
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
 * а от этого зависит, увидит ли пользователь смену статуса. Поэтому
 * к пояснению добавляется то, что видно снаружи прямо сейчас.
 */
function hintFor(statuses: InternalStatusOption[], key: string | null | undefined) {
  const stage = statuses.find((s) => s.key === key)
  if (!stage) return undefined
  return stage.publicStatusName
    ? `${stage.hint}. Связанные обращения показывают «${stage.publicStatusName}»`
    : `${stage.hint}. Пользователю этот этап не виден`
}

/** Пояснение к выбранной оценке: словами, а не числом множителя. */
function hintOf(
  options: { value: number; name: string; hint: string }[],
  value: number | null | undefined,
) {
  return options.find((o) => o.value === value)?.hint
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
