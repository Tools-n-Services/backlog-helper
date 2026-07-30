/**
 * Правила языка.
 *
 * Чистые функции, от которых зависит весь второй язык: определение языка
 * текста, выбор перевода и склонение. Ошибка здесь не падает, а тихо
 * показывает не тот текст не тому человеку.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import ru from '@content/ru.json'
import en from '@content/en.json'
import { detectLocale, fill, pickTranslation, plural } from '@/core/content'

describe('определение языка текста', () => {
  it('различает русский и английский', () => {
    assert.equal(detectLocale('Отчёт не выгружается'), 'ru')
    assert.equal(detectLocale('Export fails silently'), 'en')
  })

  it('работает на коротком тексте — его в багрепортах большинство', () => {
    assert.equal(detectLocale('не грузится'), 'ru')
    assert.equal(detectLocale('broken'), 'en')
  })

  it('решает по большинству букв, а не по первому слову', () => {
    /* «CSV не открывается в Excel» — русский текст с латинскими именами. */
    assert.equal(detectLocale('CSV не открывается в Excel после выгрузки'), 'ru')
    assert.equal(detectLocale('Export to 1С fails on the last row'), 'en')
  })

  it('текст без букв не попадает в очередь перевода', () => {
    assert.equal(detectLocale('404'), null)
    assert.equal(detectLocale('   '), null)
  })
})

describe('выбор перевода', () => {
  const translations = [
    { locale: 'en', title: 'Export fails', body: ['Nothing happens.'] },
  ]

  it('показывает перевод читателю на другом языке', () => {
    assert.equal(pickTranslation(translations, 'en', 'ru')?.locale, 'en')
  })

  it('не переводит текст, уже написанный на языке читателя', () => {
    assert.equal(pickTranslation(translations, 'ru', 'ru'), null)
  })

  it('без языка оригинала перевода не показывает', () => {
    /* Обращения, написанные до появления второго языка: у них нет ни языка,
       ни перевода, и притворяться, что есть, нельзя. */
    assert.equal(pickTranslation(translations, 'en', null), null)
  })

  it('перевода на нужный язык нет — остаётся оригинал', () => {
    /* Воркер ещё не дошёл до этого обращения: русский читатель видит
       английский текст как есть, без пометок и без пустоты. */
    assert.equal(pickTranslation(translations, 'ru', 'en'), null)
  })
})

describe('склонение и подстановка', () => {
  it('русский склоняет по трём формам', () => {
    assert.equal(plural(1, ['голос', 'голоса', 'голосов'], 'ru'), 'голос')
    assert.equal(plural(3, ['голос', 'голоса', 'голосов'], 'ru'), 'голоса')
    assert.equal(plural(11, ['голос', 'голоса', 'голосов'], 'ru'), 'голосов')
  })

  it('английский обходится двумя', () => {
    assert.equal(plural(1, ['vote', 'votes', 'votes'], 'en'), 'vote')
    assert.equal(plural(11, ['vote', 'votes', 'votes'], 'en'), 'votes')
  })

  it('подстановка сохраняет порядок слов языка', () => {
    assert.equal(fill('и ещё {count}', { count: 12 }), 'и ещё 12')
    assert.equal(fill('{count} more', { count: 12 }), '12 more')
  })
})

describe('словари', () => {
  /**
   * Пропущенный ключ во втором языке — это `undefined` на экране живого
   * человека. Сборка такое не ловит: JSON типизируется по первому словарю,
   * и отсутствующий ключ во втором становится необязательным полем.
   */
  it('английский словарь совпадает по набору ключей с русским', () => {
    const keys = (value: unknown, prefix = ''): string[] => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
      return Object.entries(value).flatMap(([key, nested]) =>
        keys(nested, prefix ? `${prefix}.${key}` : key),
      )
    }

    assert.deepEqual(keys(en).sort(), keys(ru).sort())
  })
})
