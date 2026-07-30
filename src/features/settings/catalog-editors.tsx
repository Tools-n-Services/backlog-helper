'use client'

import { useState, useTransition } from 'react'

import type { BoardEntry, StatusEntry } from '@/core/catalog'
import type { BoardInput, StatusInput } from '@/core/domain/settings/catalog-edit'
import { statusPalette } from '@config/theme'
import { shapes } from '@config/statuses'

import { saveBoardsAction, saveStatusesAction } from './actions'

/**
 * Редакторы досок и статусов (В5, docs/09-install.md).
 *
 * Идентификатор — `slug` доски и `key` статуса — правится только у новой
 * записи: у существующей он стоит в ссылках, в истории переходов и в чужих
 * закладках. Поэтому поле просто исчезает после сохранения, а не отклоняется
 * при попытке.
 */

const control =
  'w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2'

type BoardRow = BoardInput & { fresh: boolean }

export function BoardsEditor({ initial }: { initial: BoardEntry[] }) {
  const [rows, setRows] = useState<BoardRow[]>(
    initial.map((b) => ({
      slug: b.slug,
      name: b.name,
      nameEn: b.nameEn ?? '',
      description: b.description,
      descriptionEn: b.descriptionEn ?? '',
      visibility: b.visibility,
      hiddenFromNav: b.hiddenFromNav,
      requireCategory: b.requireCategory,
      fresh: false,
    })),
  )

  return (
    <Editor
      rows={rows}
      setRows={setRows}
      /* `fresh` — состояние экрана, а не данные: наружу уходит запись без него. */
      onSave={(list) => saveBoardsAction(list.map((row) => stripFresh(row)))}
      onAdd={() => ({
        slug: '',
        name: '',
        nameEn: '',
        description: '',
        descriptionEn: '',
        visibility: 'public' as const,
        hiddenFromNav: false,
        requireCategory: false,
        fresh: true,
      })}
      title={(row) => row.name || row.slug || 'Новая доска'}
      render={(row, update) => (
        <>
          {row.fresh && (
            <Field label="Адрес" hint="Часть ссылки. После сохранения не меняется">
              <input
                value={row.slug}
                onChange={(e) => update({ slug: e.target.value })}
                className={control}
              />
            </Field>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Название">
              <input
                value={row.name}
                onChange={(e) => update({ name: e.target.value })}
                className={control}
              />
            </Field>
            <Field label="Название по-английски">
              <input
                value={row.nameEn ?? ''}
                onChange={(e) => update({ nameEn: e.target.value })}
                className={control}
              />
            </Field>
          </div>
          <Field label="Описание">
            <input
              value={row.description}
              onChange={(e) => update({ description: e.target.value })}
              className={control}
            />
          </Field>
          <Field label="Описание по-английски">
            <input
              value={row.descriptionEn ?? ''}
              onChange={(e) => update({ descriptionEn: e.target.value })}
              className={control}
            />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Кто видит">
              <select
                value={row.visibility}
                onChange={(e) =>
                  update({ visibility: e.target.value as BoardInput['visibility'] })
                }
                className={control}
              >
                <option value="public">Все</option>
                <option value="readonly">Все, но без новых обращений</option>
                <option value="private">Только команда</option>
              </select>
            </Field>
            <span className="flex flex-col justify-end gap-1.5 pb-1">
              <Check
                label="Скрыть из навигации"
                checked={row.hiddenFromNav}
                onChange={(v) => update({ hiddenFromNav: v })}
              />
              <Check
                label="Категория обязательна"
                checked={row.requireCategory}
                onChange={(v) => update({ requireCategory: v })}
              />
            </span>
          </div>
        </>
      )}
      addLabel="Добавить доску"
    />
  )
}

type StatusRow = StatusInput & { fresh: boolean }

export function StatusesEditor({ initial }: { initial: StatusEntry[] }) {
  const [rows, setRows] = useState<StatusRow[]>(
    initial.map((s) => ({
      key: s.key,
      name: s.name,
      nameEn: s.nameEn ?? '',
      color: s.color,
      shape: s.shape,
      showOnRoadmap: s.showOnRoadmap,
      isTerminal: s.isTerminal,
      isDefault: s.isDefault,
      fresh: false,
    })),
  )

  return (
    <Editor
      rows={rows}
      setRows={setRows}
      onSave={(list) => saveStatusesAction(list.map((row) => stripFresh(row)))}
      onAdd={() => ({
        key: '',
        name: '',
        nameEn: '',
        color: 'gray',
        shape: 'dot' as const,
        showOnRoadmap: false,
        isTerminal: false,
        isDefault: false,
        fresh: true,
      })}
      title={(row) => row.name || row.key || 'Новый статус'}
      render={(row, update, all, setAll) => (
        <>
          {row.fresh && (
            <Field label="Ключ" hint="Стоит в истории переходов. После сохранения не меняется">
              <input
                value={row.key}
                onChange={(e) => update({ key: e.target.value })}
                className={control}
              />
            </Field>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Название">
              <input
                value={row.name}
                onChange={(e) => update({ name: e.target.value })}
                className={control}
              />
            </Field>
            <Field label="Название по-английски">
              <input
                value={row.nameEn ?? ''}
                onChange={(e) => update({ nameEn: e.target.value })}
                className={control}
              />
            </Field>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Цвет" hint="Пара с проверенным контрастом">
              <select
                value={row.color}
                onChange={(e) => update({ color: e.target.value })}
                className={control}
              >
                {statusPalette.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Форма маркера" hint="Бейдж обязан читаться и без цвета">
              <select
                value={row.shape}
                onChange={(e) => update({ shape: e.target.value as StatusInput['shape'] })}
                className={control}
              >
                {shapes.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <Check
              label="Показывать на дорожной карте"
              checked={row.showOnRoadmap}
              onChange={(v) => update({ showOnRoadmap: v })}
            />
            <Check
              label="Закрытый"
              checked={row.isTerminal}
              onChange={(v) => update({ isTerminal: v })}
            />
            <Check
              label="Начальный"
              checked={row.isDefault}
              onChange={(v) =>
                /* Начальный ровно один: снимаем отметку с остальных здесь,
                   а не отказом при сохранении — человек выбирает статус,
                   а не решает головоломку. */
                setAll(all.map((r) => ({ ...r, isDefault: v && r === row })))
              }
            />
          </div>
        </>
      )}
      addLabel="Добавить статус"
    />
  )
}

/** Убрать признак «новая запись»: он про экран, а не про справочник. */
function stripFresh<T extends { fresh: boolean }>(row: T): Omit<T, 'fresh'> {
  const copy = { ...row }
  delete (copy as { fresh?: boolean }).fresh
  return copy
}

/* ─────────────────────────── Общая механика списка ─────────────────────── */

function Editor<T extends { fresh: boolean }>({
  rows,
  setRows,
  onSave,
  onAdd,
  title,
  render,
  addLabel,
}: {
  rows: T[]
  setRows: (rows: T[]) => void
  onSave: (rows: T[]) => Promise<{ ok: true } | { ok: false; error: string }>
  onAdd: () => T
  title: (row: T) => string
  render: (
    row: T,
    update: (patch: Partial<T>) => void,
    all: T[],
    setAll: (rows: T[]) => void,
  ) => React.ReactNode
  addLabel: string
}) {
  const [baseline, setBaseline] = useState(JSON.stringify(rows))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(rows) !== baseline

  const change = (next: T[]) => {
    setSaved(false)
    setRows(next)
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)
    change(next)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await onSave(rows)
      if (result.ok) {
        /* Новые записи перестают быть новыми: их идентификатор с этой
           секунды в ссылках. */
        const settled = rows.map((row) => ({ ...row, fresh: false }))
        setRows(settled)
        setBaseline(JSON.stringify(settled))
        setSaved(true)
        return
      }
      setError(result.error)
    })
  }

  return (
    <div>
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={index} className="rounded-card border border-line bg-surface p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-body font-semibold text-ink">{title(row)}</span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Поднять: ${title(row)}`}
                  className="rounded-field px-2 py-1 text-small text-muted hover:bg-track disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={`Опустить: ${title(row)}`}
                  className="rounded-field px-2 py-1 text-small text-muted hover:bg-track disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => change(rows.filter((_, i) => i !== index))}
                  aria-label={`Убрать: ${title(row)}`}
                  className="rounded-field px-2 py-1 text-small text-muted hover:bg-track"
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="space-y-2.5">
              {render(
                row,
                (patch) => change(rows.map((r, i) => (i === index ? { ...r, ...patch } : r))),
                rows,
                change,
              )}
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => change([...rows, onAdd()])}
        className="mt-4 rounded-pill border border-line px-3.5 py-1.5 text-small font-semibold text-ink-2 hover:bg-track"
      >
        {addLabel}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card border px-4 py-3 text-small text-ink-2"
          style={{ borderColor: 'var(--color-signal-error)' }}
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-pill bg-ink px-5 py-2 text-small font-semibold text-surface hover:bg-ink-hover disabled:opacity-50"
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {saved && !dirty && (
          <span role="status" className="text-small text-muted">
            Сохранено — портал уже новый
          </span>
        )}
      </div>
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
      <span className="mb-1 block text-small text-faint">
        {label}
        {hint && <span className="ml-2">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-ink)]"
      />
      <span className="text-small text-ink-2">{label}</span>
    </label>
  )
}
