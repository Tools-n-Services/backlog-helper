import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { postTypeByKey } from '@config/post-types'
import { checkRateLimit, formatWait } from '../rate-limit'
import {
  isSearchable,
  SIMILARITY_THRESHOLD,
  similarity,
  trigrams,
  wordSimilarity,
} from '../similar'
import { validateSubmission } from '../validate'

const bug = postTypeByKey.get('bug')!
const idea = postTypeByKey.get('idea')!

describe('похожесть заголовков', () => {
  it('строит триграммы как pg_trgm — с дополнением слова', () => {
    assert.deepEqual([...trigrams('да')], ['  д', ' да', 'да '])
  })

  it('одинаковые строки дают единицу, непересекающиеся — ноль', () => {
    assert.equal(similarity('экспорт смен', 'экспорт смен'), 1)
    assert.equal(similarity('экспорт', 'фонарь'), 0)
  })

  it('переживает опечатки и раскладку', () => {
    const target = 'Экспорт графика в Excel теряет ночные смены'
    assert.ok(wordSimilarity('эксport тeряет ночные смены', target) > SIMILARITY_THRESHOLD)
    assert.ok(wordSimilarity('экспорт теряет ночныe', target) > SIMILARITY_THRESHOLD)
  })

  it('находит по части заголовка, где симметричная мера бессильна', () => {
    const target = 'Массовое копирование недели на месяц вперёд'
    assert.ok(wordSimilarity('копирование недели', target) > SIMILARITY_THRESHOLD)
    /* Симметричная мера штрафует за длину чужого текста — потому и берём word_similarity. */
    assert.ok(similarity('копирование недели', target) < wordSimilarity('копирование недели', target))
  })

  it('не срабатывает на бессмыслице', () => {
    const target = 'Экспорт графика в Excel теряет ночные смены'
    assert.ok(wordSimilarity('абракадабра квартет фонарь', target) < SIMILARITY_THRESHOLD)
  })

  it('не ищет по слишком коротким запросам', () => {
    assert.equal(isSearchable('эк'), false)
    assert.equal(isSearchable('  a  '), false)
    assert.equal(isSearchable('экспорт'), true)
  })
})

describe('проверка формы по схеме типа', () => {
  it('у бага и идеи разный набор обязательных полей', () => {
    const bugErrors = Object.keys(validateSubmission(bug, {}))
    const ideaErrors = Object.keys(validateSubmission(idea, {}))

    assert.ok(bugErrors.includes('steps'), 'багу нужны шаги воспроизведения')
    assert.ok(bugErrors.includes('expected'), 'багу нужен ожидаемый результат')
    assert.ok(bugErrors.includes('severity'))
    assert.equal(ideaErrors.includes('steps'), false)
    assert.ok(ideaErrors.includes('details'))
  })

  it('пропускает заполненную форму бага', () => {
    const errors = validateSubmission(bug, {
      title: 'Экспорт теряет ночные смены',
      actual: 'Часы после полуночи не переносятся',
      expected: 'Часы разбиты по датам',
      steps: '1. Открыть график\n2. Экспорт',
      frequency: 'always',
      severity: 'major',
    })
    assert.deepEqual(errors, {})
  })

  it('пробелы не считаются заполнением', () => {
    const errors = validateSubmission(idea, { title: '   ', details: '\n\n' })
    assert.equal(errors['title'], 'Обязательное поле')
    assert.equal(errors['details'], 'Обязательное поле')
  })

  it('ловит слишком короткий и слишком длинный заголовок', () => {
    assert.equal(
      validateSubmission(idea, { title: 'ок', details: 'текст' })['title'],
      'Слишком коротко, чтобы понять суть',
    )
    assert.match(
      validateSubmission(idea, { title: 'я'.repeat(200), details: 'текст' })['title'] ?? '',
      /Не длиннее 120/,
    )
  })

  it('обязательность категории приходит от доски, а не от типа', () => {
    assert.equal(validateSubmission(idea, {}, { requireCategory: false })['category'], undefined)
    assert.equal(
      validateSubmission(idea, {}, { requireCategory: true })['category'],
      'Выберите категорию',
    )
  })
})

describe('лимит на создание обращений', () => {
  const now = Date.UTC(2026, 6, 27, 12, 0, 0)
  const minutesAgo = (m: number) => now - m * 60_000
  const limits = { postsPerHour: 2, postsPerDay: 5 }

  it('пропускает, пока лимит не выбран', () => {
    assert.deepEqual(checkRateLimit([minutesAgo(30)], now, limits), { allowed: true })
  })

  it('останавливает на часовом лимите и говорит, сколько ждать', () => {
    const verdict = checkRateLimit([minutesAgo(50), minutesAgo(20)], now, limits)
    assert.equal(verdict.allowed, false)
    if (!verdict.allowed) {
      assert.equal(verdict.window, 'hour')
      assert.equal(verdict.retryAfterMinutes, 10)
    }
  })

  it('старые отправки не учитываются', () => {
    const verdict = checkRateLimit([minutesAgo(120), minutesAgo(90)], now, limits)
    assert.deepEqual(verdict, { allowed: true })
  })

  it('суточный лимит срабатывает, даже если часовой свободен', () => {
    const previous = [70, 80, 90, 100, 110].map((m) => minutesAgo(m * 3))
    const verdict = checkRateLimit(previous, now, limits)
    assert.equal(verdict.allowed, false)
    if (!verdict.allowed) assert.equal(verdict.window, 'day')
  })

  it('ожидание читается человеком', () => {
    assert.equal(formatWait(45), '45 мин')
    assert.equal(formatWait(120), '2 ч')
    assert.equal(formatWait(135), '2 ч 15 мин')
  })
})
