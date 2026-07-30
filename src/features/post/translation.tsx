'use client'

/**
 * Показ переведённого текста (FR-181).
 *
 * Два правила, из которых выведено всё остальное:
 *
 * 1. Перевод не выдаётся за оригинал. Пометка «Переведено с русского» стоит
 *    у самого текста, а не в углу страницы: читатель должен знать, чьи перед
 *    ним слова — автора или машины, — прежде чем на них отвечать.
 * 2. Оригинал доступен в один клик. Автор писал конкретные слова; человек,
 *    который знает оба языка, должен иметь возможность их прочитать.
 *
 * Заголовок и текст обращения переключаются вместе: они одно сообщение,
 * и наполовину переведённое обращение читается как ошибка вёрстки. Поэтому
 * состояние живёт в контексте, а не в каждом блоке отдельно — блоки стоят
 * в разных углах раскладки и общим родителем-элементом не объединяются.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'

interface Scope {
  /** Показываем перевод (иначе — оригинал). */
  translated: boolean
  toggle: () => void
  /** Есть ли что переключать. */
  available: boolean
}

const TranslationContext = createContext<Scope>({
  translated: true,
  toggle: () => {},
  available: false,
})

/**
 * Область одного сообщения: обращение целиком или один комментарий.
 *
 * Наличие перевода приходит пропом с сервера, а не собирается из детей:
 * сервер это уже знает, и лишний способ узнать то же самое — лишний способ
 * ошибиться.
 *
 * По умолчанию показывается перевод: человек, открывший портал по-английски,
 * пришёл читать по-английски. Выбор «показать оригинал» живёт до перехода
 * на другую страницу и намеренно не запоминается — он про конкретный текст,
 * а не про привычку.
 */
export function TranslationScope({
  available,
  children,
}: {
  available: boolean
  children: ReactNode
}) {
  const [translated, setTranslated] = useState(true)

  return (
    <TranslationContext.Provider
      value={{ translated, available, toggle: () => setTranslated((value) => !value) }}
    >
      {children}
    </TranslationContext.Provider>
  )
}

/**
 * Пометка и переключатель.
 *
 * Если перевода нет, не рисуется ничего: пустая строка «оригинал» под русским
 * текстом для русского читателя — шум, а не информация.
 */
export function TranslationNotice({
  from,
  showOriginal,
  showTranslation,
  className = '',
}: {
  /** Готовая фраза «Переведено с русского» — склейка строк ломает второй язык. */
  from: string
  showOriginal: string
  showTranslation: string
  className?: string
}) {
  const scope = useContext(TranslationContext)
  if (!scope.available) return null

  return (
    <p className={`flex flex-wrap items-center gap-2 text-small text-faint ${className}`}>
      <span className="rounded-field bg-track px-1.5 py-0.5 font-mono text-label uppercase">
        {from}
      </span>
      <button
        type="button"
        onClick={scope.toggle}
        className="underline underline-offset-2 hover:text-ink"
      >
        {scope.translated ? showOriginal : showTranslation}
      </button>
    </p>
  )
}

/**
 * Строка текста — заголовок обращения.
 *
 * Тег задаётся снаружи: на странице обращения это `h1`, в карточке ленты —
 * `span` внутри ссылки, и подменять семантику ради переиспользования нельзя.
 */
export function TranslatedLine({
  original,
  translation,
  as: Tag = 'span',
  className = '',
}: {
  original: string
  translation: string | null
  as?: 'h1' | 'h2' | 'span' | 'p'
  className?: string
}) {
  const scope = useContext(TranslationContext)
  return <Tag className={className}>{pick(scope.translated, translation, original)}</Tag>
}

/** Абзацы: тело обращения, выжимка в карточке, текст комментария. */
export function TranslatedParagraphs({
  original,
  translation,
  className = '',
  itemClassName = '',
}: {
  original: string[]
  translation: string[] | null
  className?: string
  itemClassName?: string
}) {
  const scope = useContext(TranslationContext)
  const lines = pick(scope.translated, translation, original)

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i} className={itemClassName}>
          {line}
        </p>
      ))}
    </div>
  )
}

function pick<T>(translated: boolean, translation: T | null, original: T): T {
  return translated && translation !== null ? translation : original
}
