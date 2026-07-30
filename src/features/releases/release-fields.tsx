import type { ReleaseDetailView } from '@/queries/types'

/**
 * Поля записи — общие для создания и правки.
 *
 * Срок публикации здесь же, а не в отдельном диалоге: дату релиза называют
 * снаружи (маркетингу, клиентам), и она должна стоять рядом с текстом,
 * который в этот день выйдет (FR-166).
 */
export function ReleaseFields({ entry }: { entry?: ReleaseDetailView }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field label="Заголовок" hint="То, что человек увидит в ленте релизов">
          <input
            name="title"
            required
            minLength={3}
            defaultValue={entry?.title ?? ''}
            className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-body text-ink"
          />
        </Field>

        <Field label="Версия" hint="Если нумеруете">
          <input
            name="version"
            defaultValue={entry?.version ?? ''}
            placeholder="2.31"
            className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2 placeholder:text-faint"
          />
        </Field>
      </div>

      <Field
        label="Вводка"
        hint="Одна-две фразы над списком изменений: зачем этот релиз людям"
      >
        <textarea
          name="lead"
          rows={3}
          defaultValue={entry?.lead ?? ''}
          className="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-body text-ink-2"
        />
      </Field>

      <Field
        label="Срок публикации"
        hint="Пусто — опубликуете руками. С датой запись выйдет сама, проходом воркера"
      >
        <input
          type="datetime-local"
          name="scheduledFor"
          defaultValue={entry?.scheduledInput ?? ''}
          className="h-8 w-full rounded-field border border-line bg-surface px-2.5 text-small text-ink-2"
        />
      </Field>
    </div>
  )
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
