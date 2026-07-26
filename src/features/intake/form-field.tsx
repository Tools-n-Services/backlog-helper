'use client'

import { useState } from 'react'

import {
  ENVIRONMENT_LABELS,
  type EnvironmentInfo,
} from '@/core/domain/intake/environment'
import type { FormField } from '@config/post-types'

/**
 * Рендер поля по его описанию из схемы типа.
 *
 * Здесь нет и не должно быть ни одного условия по ключу типа обращения:
 * различие форм бага и идеи целиком живёт в config/post-types.ts.
 * Ветвление тут — только по `kind`, то есть по виду контрола.
 */
export function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: string | string[] | boolean | undefined
  error?: string | undefined
  onChange: (value: string | string[] | boolean) => void
}) {
  const id = `field-${field.name}`
  const labelId = `${id}-label`
  const describedBy = [error ? `${id}-error` : null, field.hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ')

  /* У свёрнутого блока окружения нет постоянного контрола с этим id, поэтому
     `label for` здесь указывал бы в пустоту. Такие поля подписываются через
     aria-labelledby, иначе скринридер не назовёт группу. */
  const hasPersistentControl = field.kind !== 'environment'
  const Label = hasPersistentControl ? 'label' : 'span'

  const control =
    'w-full rounded-field border bg-surface px-3.5 py-2.5 text-body text-ink-2 placeholder:text-faint ' +
    (error ? 'border-[var(--color-signal-error)]' : 'border-line')

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label
          {...(hasPersistentControl ? { htmlFor: id } : { id: labelId })}
          className="text-body font-semibold text-ink"
        >
          {field.label}
          {!field.required && (
            <span className="ml-2 text-small font-normal text-faint">
              необязательно
            </span>
          )}
        </Label>
        {field.maxLength && typeof value === 'string' && (
          <span className="tnum shrink-0 text-small text-faint">
            {value.length} / {field.maxLength}
          </span>
        )}
      </div>

      {field.kind === 'textarea' && (
        <textarea
          id={id}
          rows={field.name === 'steps' ? 4 : 3}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`${control} resize-y`}
        />
      )}

      {(field.kind === 'text' || field.kind === 'url') && (
        <input
          id={id}
          type={field.kind === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={control}
        />
      )}

      {field.kind === 'select' && (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={control}
        >
          <option value="">Не выбрано</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {field.kind === 'checkbox' && (
        <label className="flex items-center gap-2.5">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 accent-[var(--color-ink)]"
          />
          <span className="text-body text-ink-2">{field.placeholder ?? field.label}</span>
        </label>
      )}

      {field.kind === 'environment' && (
        <EnvironmentField
          id={id}
          labelId={labelId}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
        />
      )}

      {field.kind === 'attachments' && <AttachmentsField id={id} />}

      {field.hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-small text-faint">
          {field.hint}
        </p>
      )}

      {error && (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-small font-semibold"
          style={{ color: 'var(--color-signal-error)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Окружение (FR-511): собрано автоматически, показано свёрнутым, правится.
 * Прозрачность обязательна — иначе автосбор воспринимается как слежка.
 */
function EnvironmentField({
  id,
  labelId,
  value,
  onChange,
}: {
  id: string
  labelId: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const lines = value.split('\n').filter(Boolean)

  return (
    <div className="rounded-field border border-line bg-surface" role="group" aria-labelledby={labelId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0 truncate text-body text-ink-2">
          {lines.length > 0
            ? lines.map((l) => l.split(': ')[1]).join(' · ')
            : 'Данные не собрались — заполните вручную'}
        </span>
        <span className="shrink-0 text-small text-faint">
          {open ? 'свернуть' : 'проверить'}
        </span>
      </button>

      {open && (
        <div id={`${id}-panel`} className="border-t border-line p-3.5">
          <p className="mb-2 text-small text-faint">
            Это всё, что мы отправим вместе с обращением. Поправьте, если ошиблись.
          </p>
          <textarea
            id={id}
            rows={Object.keys(ENVIRONMENT_LABELS).length}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y rounded-field border border-line bg-paper px-3 py-2 font-mono text-small text-ink-2"
          />
        </div>
      )}
    </div>
  )
}

/** Вложения. В фазе A файлы не загружаются — хранилище появится в фазе B. */
function AttachmentsField({ id }: { id: string }) {
  const [names, setNames] = useState<string[]>([])

  return (
    <div className="rounded-field border border-dashed border-line bg-surface px-3.5 py-4">
      <label htmlFor={id} className="cursor-pointer text-body text-muted">
        Перетащите скриншот, видео или лог — или{' '}
        <span className="font-semibold text-ink underline">выберите файл</span>
      </label>
      <input
        id={id}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => setNames([...(e.target.files ?? [])].map((f) => f.name))}
      />
      {names.length > 0 && (
        <ul className="mt-2 space-y-1">
          {names.map((name) => (
            <li key={name} className="text-small text-ink-2">
              {name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-small text-faint">
        До 50 МБ. Изображения, видео, логи и HAR.
      </p>
    </div>
  )
}

export type { EnvironmentInfo }
