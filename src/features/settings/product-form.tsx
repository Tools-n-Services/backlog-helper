'use client'

import { useState, useTransition } from 'react'

import type { Settings } from '@/core/settings'

import { saveProductAction } from './actions'

/**
 * Настройки продукта (В5, docs/09-install.md).
 *
 * Одна форма и одна кнопка: разделы админки сохраняются целиком, потому что
 * настройки читаются целиком — половина сохранённого дала бы портал,
 * который работает по смеси старого и нового.
 */
export function ProductForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial)
  const [baseline, setBaseline] = useState<Settings>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const control =
    'w-full rounded-field border border-line bg-surface px-3 py-2 text-body text-ink-2'

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveProductAction({
        name: form.name,
        mark: form.mark,
        domain: form.domain,
        locale: form.locale,
        features: form.features,
        limits: form.limits,
        needsInfo: form.needsInfo,
        theme: form.theme,
      })
      if (result.ok) {
        setBaseline(form)
        setSaved(true)
        return
      }
      setError(result.error)
    })
  }

  return (
    <div className="space-y-8">
      <Group title="Продукт">
        <Field label="Название">
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={control}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Знак" hint="Одна-две буквы">
            <input
              value={form.mark}
              maxLength={2}
              onChange={(e) => set('mark', e.target.value)}
              className={control}
            />
          </Field>
          <Field label="Домен" hint="Ссылки в письмах">
            <input
              value={form.domain}
              onChange={(e) => set('domain', e.target.value)}
              className={control}
            />
          </Field>
        </div>
        <Field label="Язык по умолчанию" hint="Человек сможет переключить сам">
          <select
            value={form.locale}
            onChange={(e) => set('locale', e.target.value as 'ru' | 'en')}
            className={control}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </Field>
      </Group>

      <Group title="Разделы">
        {(
          [
            ['roadmap', 'Дорожная карта'],
            ['changelog', 'Что нового'],
            ['voterList', 'Список голосовавших на обращении'],
            ['bugIntake', 'Приём сообщений об ошибках'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.features[key]}
              onChange={(e) => set('features', { ...form.features, [key]: e.target.checked })}
              className="size-4 accent-[var(--color-ink)]"
            />
            <span className="text-body text-ink-2">{label}</span>
          </label>
        ))}
      </Group>

      <Group title="Ограничения">
        <div className="grid gap-3 sm:grid-cols-3">
          <Number
            label="Обращений в сутки"
            value={form.limits.postsPerDay}
            onChange={(v) => set('limits', { ...form.limits, postsPerDay: v })}
          />
          <Number
            label="Обращений в час"
            value={form.limits.postsPerHour}
            onChange={(v) => set('limits', { ...form.limits, postsPerHour: v })}
          />
          <Number
            label="Размер страницы ленты"
            value={form.limits.feedPageSize}
            onChange={(v) => set('limits', { ...form.limits, feedPageSize: v })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Number
            label="Напомнить автору через, дней"
            value={form.needsInfo.remindAfterDays}
            onChange={(v) => set('needsInfo', { ...form.needsInfo, remindAfterDays: v })}
          />
          <Number
            label="Закрыть без ответа через, дней"
            value={form.needsInfo.closeAfterDays}
            onChange={(v) => set('needsInfo', { ...form.needsInfo, closeAfterDays: v })}
          />
        </div>
      </Group>

      <Group title="Оформление">
        <p className="text-small text-muted">
          Палитра интерфейса монохромна: цвет несёт состояние, а не бренд.
          Поэтому фирменный цвет здесь один — он же цвет всех действий.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Color
            label="Основной"
            value={form.theme.ink}
            onChange={(v) => set('theme', { ...form.theme, ink: v })}
          />
          <Color
            label="При наведении"
            value={form.theme.inkHover}
            onChange={(v) => set('theme', { ...form.theme, inkHover: v })}
          />
        </div>
      </Group>

      {error && (
        <p
          role="alert"
          className="rounded-card border px-4 py-3 text-small text-ink-2"
          style={{ borderColor: 'var(--color-signal-error)' }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-5">
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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-label uppercase text-faint">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
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
      <span className="mb-1 block text-small font-semibold text-ink">
        {label}
        {hint && <span className="ml-2 font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Number({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(globalThis.Number(e.target.value))}
        className="w-full rounded-field border border-line bg-surface px-3 py-2 text-body text-ink-2"
      />
    </Field>
  )
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}: выбрать цвет`}
          className="size-9 shrink-0 rounded-field border border-line bg-surface"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-field border border-line bg-surface px-3 py-2 font-mono text-small text-ink-2"
        />
      </span>
    </Field>
  )
}
