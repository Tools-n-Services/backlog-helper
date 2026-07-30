'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'

import {
  fill,
  localized,
  plural,
  type Dictionary,
  type Locale,
} from '@/core/content'
import { formatWait } from '@/core/domain/intake/rate-limit'
import { isSearchable } from '@/core/domain/intake/similar'
import type { FieldErrors, FormValues } from '@/core/domain/intake/validate'
import type { BoardView, SimilarPostView } from '@/queries/types'
import type { TypeEntry } from '@/core/catalog'

import { searchSimilar, submitPost, type SubmitResult } from './actions'
import { Field } from './form-field'
import { SimilarInset } from './similar-inset'
import { useEnvironmentText } from './use-environment'

const SIMILAR_DEBOUNCE_MS = 300

/**
 * Форма обращения. Рендерится по схеме типа (FR-502) — ни одного условия
 * по ключу типа: чтобы у бага появились шаги воспроизведения, а у идеи нет,
 * правится config/post-types.ts, а не этот файл.
 */
export function PostForm({
  board,
  type,
  t,
  lang,
  translating = false,
}: {
  board: BoardView
  type: TypeEntry
  t: Dictionary
  lang: Locale
  /** Перевод включён — обещаем его человеку прямо у кнопки (FR-181). */
  translating?: boolean
}) {
  const [values, setValues] = useState<FormValues>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [candidates, setCandidates] = useState<SimilarPostView[]>([])
  /* Заголовок, для которого получены текущие кандидаты. Из расхождения
     с введённым выводится состояние «ищем» — без setState в эффекте. */
  const [candidatesFor, setCandidatesFor] = useState('')
  const [pending, startTransition] = useTransition()

  const environmentText = useEnvironmentText()
  const environmentField = type.formSchema.find((f) => f.kind === 'environment')

  const titleField = type.formSchema.find((f) => f.kind === 'text' && f.required)
  const title = typeof values[titleField?.name ?? ''] === 'string'
    ? (values[titleField!.name] as string)
    : ''

  /* Поиск похожих на вводе заголовка, с паузой — иначе запрос на каждую букву. */
  useEffect(() => {
    if (!isSearchable(title)) return
    const timer = setTimeout(() => {
      searchSimilar(board.slug, type.key, title)
        .then((found) => {
          setCandidates(found)
          setCandidatesFor(title)
        })
        .catch(() => {
          setCandidates([])
          setCandidatesFor(title)
        })
    }, SIMILAR_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [title, board.slug, type.key])

  const searchable = isSearchable(title)
  const fresh = candidatesFor === title
  const shownCandidates = searchable && fresh ? candidates : []
  const searching = searchable && !fresh

  const set = (name: string) => (value: FormValues[string]) => {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => {
      if (!e[name]) return e
      const next = { ...e }
      delete next[name]
      return next
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const payload: FormValues = environmentField
        ? { [environmentField.name]: environmentText, ...values }
        : values
      const outcome = await submitPost(board.slug, type.key, payload)
      if (!outcome.ok && outcome.kind === 'validation') {
        setErrors(outcome.errors)
        /* Ошибка не только у поля, но и сводкой сверху (07-ui-brief.md, раздел 8). */
        setResult(outcome)
        return
      }
      setErrors({})
      setResult(outcome)
    })
  }

  if (result?.ok) {
    return (
      <Sent
        board={board}
        refCode={result.ref}
        slug={result.slug}
        moderated={result.moderated}
        t={t}
      />
    )
  }
  if (result && !result.ok && result.kind === 'rate-limit') {
    return <LimitReached board={board} limit={result} t={t} lang={lang} />
  }
  if (result && !result.ok && result.kind === 'auth') {
    return <NeedsAccess board={board} reason={result.reason} t={t} />
  }

  const errorList = Object.entries(errors)

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {errorList.length > 0 && (
        <div
          role="alert"
          className="rounded-card border bg-surface px-4 py-3"
          style={{ borderColor: 'var(--color-signal-error)' }}
        >
          <p className="text-body font-semibold text-ink">
            {errorList.length === 1 ? t.intake.missingOne : t.intake.missingMany}
          </p>
          <ul className="mt-1 space-y-0.5">
            {errorList.map(([name, message]) => (
              <li key={name} className="text-small text-muted">
                {fieldLabel(type, name, lang)}: {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {type.formSchema.map((field) => (
        <div key={field.name}>
          <Field
            field={field}
            value={
              field.name === environmentField?.name
                ? (values[field.name] ?? environmentText)
                : values[field.name]
            }
            error={errors[field.name]}
            onChange={set(field.name)}
            t={t}
            lang={lang}
          />
          {/* Похожие показываются сразу под заголовком: позже человек уже
              вложился в текст и не откажется от своего обращения. */}
          {field.name === titleField?.name && (
            <SimilarInset
              candidates={shownCandidates}
              searching={searching}
              t={t}
              lang={lang}
            />
          )}
        </div>
      ))}

      {board.categories.length > 0 && (
        <div>
          <label
            htmlFor="field-category"
            className="mb-1.5 block text-body font-semibold text-ink"
          >
            {t.intake.category}
            {!board.requireCategory && (
              <span className="ml-2 text-small font-normal text-faint">
                {t.intake.optional}
              </span>
            )}
          </label>
          <select
            id="field-category"
            value={typeof values['category'] === 'string' ? values['category'] : ''}
            onChange={(e) => set('category')(e.target.value)}
            aria-invalid={Boolean(errors['category'])}
            className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-body text-ink-2"
          >
            <option value="">{t.intake.categoryNotSelected}</option>
            {board.categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          {errors['category'] && (
            <p
              className="mt-1.5 text-small font-semibold"
              style={{ color: 'var(--color-signal-error)' }}
            >
              {errors['category']}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface transition-colors hover:bg-ink-hover disabled:opacity-60"
        >
          {pending ? t.intake.submitting : t.intake.submit}
        </button>
        <Link
          href={`/${board.slug}/new`}
          className="text-small text-muted underline underline-offset-2 hover:text-ink"
        >
          {t.intake.changeType}
        </Link>
        {/* Автоперевод — не сюрприз: человек должен знать, что его текст
            прочитают на другом языке, до того как нажмёт «Отправить». */}
        {translating && (
          <p className="basis-full text-small text-faint">{t.intake.autoTranslate}</p>
        )}
      </div>
    </form>
  )
}

/** Что дальше — важнее благодарности: человек должен знать, чего ждать. */
/**
 * Отказ по правам после отправки.
 *
 * Форма показывается и гостю — иначе неясно, что вообще предлагают заполнить.
 * Но отправка требует входа, и узнать об этом человек должен вместе
 * со своим текстом на экране, а не вместо него.
 */
function NeedsAccess({
  board,
  reason,
  t,
}: {
  board: BoardView
  reason: 'unauthorized' | 'banned'
  t: Dictionary
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-6 py-10 text-center">
      <h2 className="text-h3 font-bold text-ink">
        {reason === 'banned' ? t.intake.bannedTitle : t.intake.needSignInTitle}
      </h2>
      <p className="mx-auto mt-2 max-w-[48ch] text-body text-muted">
        {reason === 'banned' ? t.intake.bannedLead : t.intake.needSignInLead}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {reason === 'unauthorized' && (
          <Link
            href="/login"
            className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface"
          >
            {t.nav.signIn}
          </Link>
        )}
        <Link
          href={`/${board.slug}`}
          className="rounded-pill border border-line px-5 py-2.5 text-small font-semibold text-ink-2"
        >
          {t.auth.readPosts}
        </Link>
      </div>
    </div>
  )
}

function Sent({
  board,
  refCode,
  slug,
  moderated,
  t,
}: {
  board: BoardView
  refCode: string
  slug: string
  moderated: boolean
  t: Dictionary
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-6 py-10 text-center">
      <p className="font-mono text-label uppercase text-faint">{refCode}</p>
      <h2 className="mt-3 text-h3 font-bold text-ink">{t.intake.sentTitle}</h2>
      <p className="mx-auto mt-2 max-w-[48ch] text-body text-muted">
        {moderated ? t.intake.sentModerated : t.intake.sentPlain}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {/* Обращение теперь существует по своему адресу — первым делом
            даём на него посмотреть, а не отправляем обратно в ленту. */}
        <Link
          href={`/${board.slug}/p/${slug}` as Route}
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface"
        >
          {t.intake.openPost}
        </Link>
        <Link
          href={`/${board.slug}`}
          className="rounded-pill border border-line px-5 py-2.5 text-small font-semibold text-ink-2"
        >
          {t.intake.backToFeed}
        </Link>
      </div>
    </div>
  )
}

/**
 * Лимит исчерпан (FR-126). Ошибка обязана называть причину и срок, а не быть
 * пятисоткой: чаще всего сюда упирается не спамер, а тот, кому есть что сказать.
 */
function LimitReached({
  board,
  limit,
  t,
  lang,
}: {
  board: BoardView
  limit: { window: 'hour' | 'day'; limit: number; retryAfterMinutes: number }
  t: Dictionary
  lang: Locale
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-6 py-10 text-center">
      <h2 className="text-h3 font-bold text-ink">
        {fill(t.intake.limitTitle, {
          count: limit.limit,
          label: plural(limit.limit, t.common.posts, lang),
          period:
            limit.window === 'hour' ? t.intake.limitPeriodHour : t.intake.limitPeriodDay,
        })}
      </h2>
      <p className="mx-auto mt-2 max-w-[48ch] text-body text-muted">
        {fill(t.intake.limitLead, {
          wait: formatWait(limit.retryAfterMinutes, {
            minutes: t.intake.waitMinutes,
            hours: t.intake.waitHours,
            hoursMinutes: t.intake.waitHoursMinutes,
          }),
        })}
      </p>
      <Link
        href={`/${board.slug}`}
        className="mt-6 inline-block rounded-pill bg-ink px-5 py-2.5 text-small font-semibold text-surface"
      >
        {t.intake.backToFeed}
      </Link>
    </div>
  )
}

/** Подпись поля из схемы типа — на языке смотрящего. */
function fieldLabel(type: TypeEntry, name: string, lang: Locale): string {
  const field = type.formSchema.find((f) => f.name === name)
  return field ? localized(field.label, field.labelEn, lang) : name
}
