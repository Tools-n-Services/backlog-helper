'use client'

import { useState, useTransition } from 'react'

import { attachmentRules, maxAttachmentsPerPost } from '@config/attachments'
import { fill, localized, type Dictionary, type Locale } from '@/core/content'
import { sizeLabel } from '@/core/format'
import {
  ENVIRONMENT_LABELS,
  type EnvironmentInfo,
} from '@/core/domain/intake/environment'
import type { FormField } from '@config/post-types'

import { discardAttachmentAction, uploadAttachmentAction } from './actions'

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
  t,
  lang,
}: {
  field: FormField
  value: string | string[] | boolean | undefined
  error?: string | undefined
  onChange: (value: string | string[] | boolean) => void
  t: Dictionary
  lang: Locale
}) {
  /* Подписи полей живут в схеме типа рядом с самим полем, а не в словаре:
     форк, добавивший своё поле, добавляет и его названия — в одном месте. */
  const label = localized(field.label, field.labelEn, lang)
  const hint = field.hint ? localized(field.hint, field.hintEn, lang) : undefined
  const placeholder = field.placeholder
    ? localized(field.placeholder, field.placeholderEn, lang)
    : undefined
  const id = `field-${field.name}`
  const labelId = `${id}-label`
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
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
          {label}
          {!field.required && (
            <span className="ml-2 text-small font-normal text-faint">
              {t.intake.optional}
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
          placeholder={placeholder}
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
          placeholder={placeholder}
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
          <option value="">{t.intake.notSelected}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {localized(option.label, option.labelEn, lang)}
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
          <span className="text-body text-ink-2">{placeholder ?? label}</span>
        </label>
      )}

      {field.kind === 'environment' && (
        <EnvironmentField
          id={id}
          labelId={labelId}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          t={t}
        />
      )}

      {field.kind === 'attachments' && (
        /* Список загруженного держит сам компонент: в значении формы живут
           только идентификаторы, а имена и размеры нужны лишь ему. */
        <AttachmentsField id={id} onChange={onChange} t={t} lang={lang} />
      )}

      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-small text-faint">
          {hint}
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
  t,
}: {
  id: string
  labelId: string
  value: string
  onChange: (value: string) => void
  t: Dictionary
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
            : t.intake.envEmpty}
        </span>
        <span className="shrink-0 text-small text-faint">
          {open ? t.intake.envCollapse : t.intake.envCheck}
        </span>
      </button>

      {open && (
        <div id={`${id}-panel`} className="border-t border-line p-3.5">
          <p className="mb-2 text-small text-faint">{t.intake.envNote}</p>
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

interface Uploaded {
  id: string
  name: string
  size: string
}

/**
 * Вложения (FR-512).
 *
 * Файл уходит в хранилище сразу при выборе, а не вместе с формой. Причина
 * не в удобстве: скриншот в пятьдесят мегабайт, отправленный вместе с текстом,
 * либо упирается в лимит тела запроса, либо заставляет человека ждать после
 * нажатия «Отправить» — а он в этот момент уже считает, что закончил.
 *
 * Отказ показывается сразу и словами: «такие файлы не принимаем» на этапе
 * выбора экономит тот самый раунд переписки, ради которого вложения и нужны.
 */
function AttachmentsField({
  id,
  onChange,
  t,
  lang,
}: {
  id: string
  onChange: (value: string[]) => void
  t: Dictionary
  lang: Locale
}) {
  const [files, setFiles] = useState<Uploaded[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const accept = attachmentRules.flatMap((rule) => rule.mimes).join(',')

  const upload = (chosen: FileList | null) => {
    const list = [...(chosen ?? [])]
    if (list.length === 0) return
    setError(null)

    startTransition(async () => {
      const added: Uploaded[] = []
      for (const file of list.slice(0, maxAttachmentsPerPost - files.length)) {
        const data = new FormData()
        data.set('file', file)
        const result = await uploadAttachmentAction(data)
        if (!result.ok) {
          setError(result.message)
          continue
        }
        added.push({ id: result.id, name: result.name, size: sizeLabel(result.sizeBytes) })
      }
      if (added.length === 0) return
      const next = [...files, ...added]
      setFiles(next)
      onChange(next.map((f) => f.id))
    })
  }

  const discard = (fileId: string) => {
    const next = files.filter((f) => f.id !== fileId)
    setFiles(next)
    onChange(next.map((f) => f.id))
    startTransition(async () => {
      await discardAttachmentAction(fileId)
    })
  }

  const full = files.length >= maxAttachmentsPerPost

  return (
    <div className="rounded-field border border-dashed border-line bg-surface px-3.5 py-4">
      <label
        htmlFor={id}
        className={full ? 'text-body text-faint' : 'cursor-pointer text-body text-muted'}
      >
        {pending ? (
          t.intake.uploading
        ) : full ? (
          fill(t.intake.filesFull, { count: maxAttachmentsPerPost })
        ) : (
          <>
            {t.intake.dropHint}{' '}
            <span className="font-semibold text-ink underline">
              {t.intake.chooseFile}
            </span>
          </>
        )}
      </label>
      <input
        id={id}
        type="file"
        multiple
        accept={accept}
        disabled={pending || full}
        className="sr-only"
        onChange={(e) => {
          upload(e.target.files)
          /* Сброс значения: иначе тот же файл, выбранный второй раз после
             удаления, не даёт события change. */
          e.target.value = ''
        }}
      />

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file) => (
            <li key={file.id} className="flex items-baseline gap-2 text-small text-ink-2">
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="tnum shrink-0 text-faint">{file.size}</span>
              <button
                type="button"
                onClick={() => discard(file.id)}
                className="ml-auto shrink-0 rounded-field px-2 text-muted hover:bg-track hover:text-ink"
              >
                {t.intake.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1.5 text-small text-[var(--color-signal-error)]">{error}</p>}

      <p className="mt-1.5 text-small text-faint">
        {/* Пределы — из конфига: подпись, разошедшаяся с проверкой на сервере,
            обещает то, что будет отвергнуто. */}
        {fill(t.intake.filesNote, {
          limits: attachmentRules
            .map((rule) =>
              fill(t.intake.ruleLimit, {
                name: localized(rule.name, rule.nameEn, lang),
                size: sizeLabel(rule.maxBytes),
              }),
            )
            .join(' · '),
        })}
      </p>
    </div>
  )
}

export type { EnvironmentInfo }
