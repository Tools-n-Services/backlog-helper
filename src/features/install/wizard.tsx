'use client'

import { useState, useTransition } from 'react'

import type { EnvironmentCheck, Preset } from '@/core/install'

import { completeInstallAction, sendTestLetterAction } from './actions'

/**
 * Мастер первого запуска (В4, docs/09-install.md).
 *
 * Шагов пять, и это решение, а не нехватка времени: полный контроль
 * не означает длинную анкету. Сорок вопросов на первом запуске — способ
 * потерять человека на пятом; всё остальное правится в админке, куда
 * ведёт последний экран.
 *
 * Почта здесь проверяется, а не настраивается: канал живёт в переменных
 * среды, потому что в контейнере их задаёт платформа, а не приложение,
 * которое эту среду читает. Мастер обязан сказать, работает ли то, что
 * задали, — до того как портал останется без единственного способа входа.
 */
type Step = 'environment' | 'product' | 'preset' | 'mail' | 'owner'

const ORDER: Step[] = ['environment', 'product', 'preset', 'mail', 'owner']

const TITLES: Record<Step, string> = {
  environment: 'Проверка среды',
  product: 'Продукт',
  preset: 'С чего начать',
  mail: 'Почта',
  owner: 'Владелец',
}

export function InstallWizard({
  checks,
  presets,
  mail,
  defaults,
}: {
  checks: EnvironmentCheck[]
  presets: Preset[]
  mail: string
  defaults: { name: string; mark: string; domain: string; locale: 'ru' | 'en' }
}) {
  const [step, setStep] = useState<Step>('environment')
  const [name, setName] = useState(defaults.name)
  const [mark, setMark] = useState(defaults.mark)
  const [domain, setDomain] = useState(defaults.domain)
  const [locale, setLocale] = useState<'ru' | 'en'>(defaults.locale)
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? 'product')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [letter, setLetter] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const blocking = checks.filter((c) => !c.ok)
  const index = ORDER.indexOf(step)
  const control =
    'w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-body text-ink-2'

  const go = (next: Step) => {
    setError(null)
    setStep(next)
  }

  const test = () => {
    setLetter(null)
    setError(null)
    startTransition(async () => {
      const result = await sendTestLetterAction(ownerEmail)
      if (result.ok) setLetter('Письмо отправлено. Проверьте ящик.')
      else setError(result.error)
    })
  }

  const finish = () => {
    setError(null)
    startTransition(async () => {
      const result = await completeInstallAction({
        presetKey,
        name,
        mark,
        domain,
        locale,
        ownerEmail,
        ownerName,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      /* Полный переход, а не смена шага: с этой секунды установка завершена,
         и страница мастера перестала существовать — нарисованное на ней
         «Готово» стёрлось бы первым же обновлением. */
      window.location.href = '/install/done'
    })
  }

  return (
    <div>
      <p className="font-mono text-label uppercase text-faint">
        Шаг {index + 1} из {ORDER.length} · {TITLES[step]}
      </p>
      <h1 className="mt-3 text-h1 font-light text-ink">
        Установка <span className="font-extrabold">портала</span>
      </h1>

      {step === 'environment' && (
        <section className="mt-8">
          <ul className="space-y-2.5">
            {checks.map((check) => (
              <li
                key={check.key}
                className="flex gap-3 rounded-card border border-line bg-surface p-4"
              >
                <span aria-hidden className="text-body">
                  {check.ok ? '✓' : '✕'}
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-ink">
                    {check.title}
                  </span>
                  <span className="mt-0.5 block text-small text-muted">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {blocking.length > 0 && (
            <p className="mt-4 text-small text-muted">
              Установка возможна и так, но перечисленное сломается позже —
              и заметить это будет нечем.
            </p>
          )}
          <Actions>
            <Next onClick={() => go('product')}>Дальше</Next>
          </Actions>
        </section>
      )}

      {step === 'product' && (
        <section className="mt-8 space-y-4">
          <Field label="Название портала">
            <input value={name} onChange={(e) => setName(e.target.value)} className={control} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Знак в шапке" hint="Одна-две буквы">
              <input
                value={mark}
                maxLength={2}
                onChange={(e) => setMark(e.target.value)}
                className={control}
              />
            </Field>
            <Field label="Домен" hint="Без протокола: ссылки в письмах">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className={control}
              />
            </Field>
          </div>
          <Field label="Язык по умолчанию" hint="Человек сможет переключить сам">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'ru' | 'en')}
              className={control}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Actions>
            <Back onClick={() => go('environment')} />
            <Next onClick={() => go('preset')} disabled={!name.trim()}>
              Дальше
            </Next>
          </Actions>
        </section>
      )}

      {step === 'preset' && (
        <section className="mt-8">
          <p className="text-body text-muted">
            Набор досок, типов обращений и статусов. Всё это правится потом
            в админке — выбор здесь только про то, с чего начать.
          </p>
          <ul className="mt-5 space-y-2.5">
            {presets.map((preset) => (
              <li key={preset.key}>
                <label className="flex cursor-pointer gap-3 rounded-card border border-line bg-surface p-4">
                  <input
                    type="radio"
                    name="preset"
                    checked={presetKey === preset.key}
                    onChange={() => setPresetKey(preset.key)}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-ink)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-ink">
                      {preset.name}
                    </span>
                    <span className="mt-0.5 block text-small text-muted">{preset.hint}</span>
                    <span className="mt-1 block font-mono text-label uppercase text-faint">
                      доски: {preset.boardSlugs.join(', ')} · типы:{' '}
                      {preset.typeKeys.join(', ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Actions>
            <Back onClick={() => go('product')} />
            <Next onClick={() => go('mail')}>Дальше</Next>
          </Actions>
        </section>
      )}

      {step === 'mail' && (
        <section className="mt-8 space-y-4">
          <p className="text-body text-muted">
            Канал доставки:{' '}
            <span className="font-mono text-small text-ink-2">MAIL_PROVIDER={mail}</span>.
            Он задаётся переменными среды — мастер их не меняет: в контейнере
            среду задаёт платформа.
          </p>
          {mail === 'file' && (
            <p className="rounded-card border border-line bg-surface-2 px-4 py-3 text-small text-ink-2">
              Сейчас письма складываются в файлы и никуда не уходят. Для боевой
              установки задайте настоящий канал — вход в портал работает только
              по письму.
            </p>
          )}
          <Field label="Адрес для пробного письма" hint="Он же станет адресом владельца">
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className={control}
            />
          </Field>
          <button
            type="button"
            onClick={test}
            disabled={pending || !ownerEmail.trim()}
            className="rounded-pill border border-line px-4 py-2 text-small font-semibold text-ink-2 hover:bg-track disabled:opacity-50"
          >
            {pending ? 'Отправляем…' : 'Отправить пробное письмо'}
          </button>
          {letter && (
            <p role="status" className="text-small text-muted">
              {letter}
            </p>
          )}
          <Actions>
            <Back onClick={() => go('preset')} />
            <Next onClick={() => go('owner')}>Дальше</Next>
          </Actions>
        </section>
      )}

      {step === 'owner' && (
        <section className="mt-8 space-y-4">
          <p className="text-body text-muted">
            Владелец видит всё и раздаёт права. После установки он войдёт
            в портал сразу в этом браузере — без письма.
          </p>
          <Field label="Почта владельца">
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className={control}
            />
          </Field>
          <Field label="Имя">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className={control}
            />
          </Field>
          <Actions>
            <Back onClick={() => go('mail')} />
            <button
              type="button"
              onClick={finish}
              disabled={pending || !ownerEmail.trim()}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface hover:bg-ink-hover disabled:opacity-50"
            >
              {pending ? 'Устанавливаем…' : 'Установить портал'}
            </button>
          </Actions>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-card border px-4 py-3 text-small text-ink-2"
          style={{ borderColor: 'var(--color-signal-error)' }}
        >
          {error}
        </p>
      )}
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
      <span className="mb-1.5 block text-body font-semibold text-ink">
        {label}
        {hint && <span className="ml-2 text-small font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-7 flex flex-wrap items-center gap-3">{children}</div>
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-small text-muted underline underline-offset-2 hover:text-ink"
    >
      Назад
    </button>
  )
}

function Next({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface hover:bg-ink-hover disabled:opacity-50"
    >
      {children}
    </button>
  )
}
