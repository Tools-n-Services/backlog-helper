'use client'

import { useState, useTransition } from 'react'

import {
  fieldKinds,
  fieldKindByKey,
  systemFieldByName,
  systemFields,
} from '@/core/domain/intake/form-schema'
import type { FieldKind, FormField } from '@config/post-types'

import { saveSchemaAction } from './actions'

/**
 * Редактор схемы формы (В3, docs/09-install.md).
 *
 * Порядок меняется стрелками, а не перетаскиванием. Причина не в экономии:
 * перетаскивание требует своей механики ранжирования (она заведена отдельной
 * работой D4), не работает с клавиатуры без второго интерфейса и на списке
 * из шести полей выигрывает разве что в ощущении. Стрелки работают везде
 * и читаются скринридером.
 *
 * Системные поля помечены замком: их можно переименовать, переставить,
 * сделать необязательными и убрать из формы — но не превратить в другое
 * поле. За `severity` стоит срок первого ответа и порядок очереди, и тихая
 * подмена смысла сломала бы приоритизацию так, что заметить это будет нечем.
 */
export function FieldEditor({
  typeKey,
  typeName,
  initial,
}: {
  typeKey: string
  typeName: string
  initial: FormField[]
}) {
  const [fields, setFields] = useState<FormField[]>(initial)
  /* Точка отсчёта для «есть несохранённое»: не проп с сервера, а последнее
     сохранённое здесь. После сохранения страница перерисовывается сама,
     и сравнение с пропом зависело бы от того, кто успел раньше. */
  const [baseline, setBaseline] = useState<FormField[]>(initial)
  const [problems, setProblems] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline)

  const update = (index: number, patch: Partial<FormField>) => {
    setSaved(false)
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    setSaved(false)
    setFields((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved!)
      return next
    })
  }

  const remove = (index: number) => {
    setSaved(false)
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const addCustom = () => {
    setSaved(false)
    /* Имя генерируется, а не спрашивается: оно техническое, попадает в ключи
       `custom_fields` и человеку ни о чём не говорит. Переименовать его
       нельзя — по нему находятся уже сохранённые значения. */
    const taken = new Set(fields.map((f) => f.name))
    let n = 1
    while (taken.has(`field-${n}`)) n++
    setFields((prev) => [
      ...prev,
      { name: `field-${n}`, label: '', kind: 'text', required: false },
    ])
  }

  const addSystem = (name: string) => {
    const system = systemFieldByName.get(name)
    if (!system) return
    setSaved(false)
    setFields((prev) => [
      ...prev,
      { name: system.name, label: system.name, kind: system.kind, required: false },
    ])
  }

  const save = () => {
    setProblems([])
    startTransition(async () => {
      const result = await saveSchemaAction(typeKey, fields)
      if (result.ok) {
        setBaseline(fields)
        setSaved(true)
        return
      }
      if (result.reason === 'invalid') {
        setProblems(
          result.problems.map((p) =>
            p.index >= 0 ? `Поле ${p.index + 1}: ${p.message}` : p.message,
          ),
        )
        return
      }
      setProblems([
        result.reason === 'forbidden'
          ? 'Недостаточно прав: схему правит администратор'
          : 'Тип обращения не найден',
      ])
    })
  }

  const missingSystem = systemFields.filter((s) => !fields.some((f) => f.name === s.name))

  return (
    <div>
      <p className="mb-4 text-small text-muted">
        Форма типа «{typeName}». Порядок полей здесь — порядок на экране,
        который увидит человек.
      </p>

      <ol className="space-y-3">
        {fields.map((field, index) => (
          <li key={field.name}>
            <FieldRow
              field={field}
              index={index}
              total={fields.length}
              onChange={(patch) => update(index, patch)}
              onMove={(delta) => move(index, delta)}
              onRemove={() => remove(index)}
            />
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addCustom}
          className="rounded-pill border border-line px-3.5 py-1.5 text-small font-semibold text-ink-2 hover:bg-track"
        >
          Добавить поле
        </button>
        {missingSystem.map((system) => (
          <button
            key={system.name}
            type="button"
            onClick={() => addSystem(system.name)}
            title={system.why}
            className="rounded-pill border border-dashed border-line px-3.5 py-1.5 text-small text-muted hover:bg-track hover:text-ink"
          >
            + {system.name}
          </button>
        ))}
      </div>

      {problems.length > 0 && (
        <div
          role="alert"
          className="mt-5 rounded-card border bg-surface px-4 py-3"
          style={{ borderColor: 'var(--color-signal-error)' }}
        >
          <p className="text-body font-semibold text-ink">Схема не сохранена</p>
          <ul className="mt-1 space-y-0.5">
            {problems.map((problem) => (
              <li key={problem} className="text-small text-muted">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface transition-colors hover:bg-ink-hover disabled:opacity-50"
        >
          {pending ? 'Сохраняем…' : 'Сохранить форму'}
        </button>
        {saved && !dirty && (
          <span className="text-small text-muted" role="status">
            Сохранено — форма на портале уже новая
          </span>
        )}
      </div>
    </div>
  )
}

function FieldRow({
  field,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  field: FormField
  index: number
  total: number
  onChange: (patch: Partial<FormField>) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const system = systemFieldByName.get(field.name)
  const kind = fieldKindByKey.get(field.kind)
  const control =
    'w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2'

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-label uppercase text-faint">{field.name}</span>
        {system && (
          <span
            title={system.why}
            className="rounded-pill bg-track px-2 py-0.5 text-[11px] font-semibold text-muted"
          >
            системное
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Поднять поле ${field.name}`}
            className="rounded-field px-2 py-1 text-small text-muted hover:bg-track disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Опустить поле ${field.name}`}
            className="rounded-field px-2 py-1 text-small text-muted hover:bg-track disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={system?.required}
            title={
              system?.required
                ? 'Без этого поля обращение не существует'
                : system
                  ? 'Убрать из формы. Данные прошлых обращений останутся'
                  : 'Удалить поле'
            }
            aria-label={`Убрать поле ${field.name}`}
            className="rounded-field px-2 py-1 text-small text-muted hover:bg-track disabled:opacity-30"
          >
            ✕
          </button>
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-small text-faint">Подпись</span>
          <input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className={control}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-small text-faint">Вид</span>
          <select
            value={field.kind}
            disabled={Boolean(system)}
            onChange={(e) => onChange({ kind: e.target.value as FieldKind })}
            className={`${control} disabled:opacity-60`}
          >
            {fieldKinds.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-small text-faint">Подсказка под полем</span>
          <input
            value={field.hint ?? ''}
            onChange={(e) => onChange({ hint: e.target.value })}
            className={control}
          />
        </label>

        {kind?.options && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-small text-faint">
              Варианты: по одному в строке, «значение | подпись»
            </span>
            <textarea
              rows={3}
              value={(field.options ?? [])
                .map((o) => `${o.value} | ${o.label}`)
                .join('\n')}
              onChange={(e) => onChange({ options: parseOptions(e.target.value) })}
              className={`${control} resize-y font-mono`}
            />
          </label>
        )}

        {kind?.placeholder && (
          <label className="block">
            <span className="mb-1 block text-small text-faint">Пример ввода</span>
            <input
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              className={control}
            />
          </label>
        )}

        {kind?.maxLength && (
          <label className="block">
            <span className="mb-1 block text-small text-faint">Предел длины</span>
            <input
              type="number"
              min={1}
              value={field.maxLength ?? ''}
              onChange={(e) =>
                onChange({
                  maxLength: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className={control}
            />
          </label>
        )}

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="size-4 accent-[var(--color-ink)]"
          />
          <span className="text-small text-ink-2">Обязательное</span>
        </label>
      </div>
    </div>
  )
}

/** «blocker | Блокирует работу» — значение слева, подпись справа. */
function parseOptions(text: string): { value: string; label: string }[] {
  return text
    .split('\n')
    .map((line) => {
      const [value, ...rest] = line.split('|')
      return {
        value: (value ?? '').trim(),
        label: rest.join('|').trim() || (value ?? '').trim(),
      }
    })
    .filter((option) => option.value)
}
