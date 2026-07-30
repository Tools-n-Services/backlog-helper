/**
 * Проверка схемы формы (В3).
 *
 * До сих пор схему проверял компилятор: неверная форма не доживала
 * до выкладки. Теперь её правит человек в админке, и вся эта проверка
 * переехала сюда. Поэтому тесты идут от того, что человек сделает
 * по-настоящему: оставит подпись пустой, заведёт два поля с одним именем,
 * сделает выбор с единственным вариантом, попробует превратить системное
 * поле в другое.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import {
  checkSchema,
  customValues,
  isSystemField,
} from '@/core/domain/intake/form-schema'
import type { FormField } from '@config/post-types'

const title: FormField = { name: 'title', label: 'Коротко о чём речь', kind: 'text', required: true }

function check(fields: unknown[]) {
  return checkSchema(fields)
}

describe('проверка схемы', () => {
  it('обычная схема проходит', () => {
    const result = check([
      title,
      { name: 'details', label: 'Подробности', kind: 'textarea', required: false },
    ])
    assert.equal(result.ok, true)
  })

  it('без заголовка схему не сохранить', () => {
    const result = check([
      { name: 'details', label: 'Подробности', kind: 'textarea', required: true },
    ])
    assert.equal(result.ok, false)
    /* Обращение без заголовка нечем назвать в ленте, в письме и в очереди. */
    assert.match(result.ok ? '' : result.problems[0]!.message, /title/)
  })

  it('пустая подпись отклоняется', () => {
    const result = check([title, { name: 'extra', label: '   ', kind: 'text' }])
    assert.equal(result.ok, false)
  })

  it('два поля с одним именем — ошибка, а не молчаливая перезапись', () => {
    const result = check([
      title,
      { name: 'note', label: 'Заметка', kind: 'text' },
      { name: 'note', label: 'Вторая заметка', kind: 'textarea' },
    ])
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.problems[0]!.message, /занято/)
  })

  it('имя поля ограничено: оно становится ключом в custom_fields', () => {
    assert.equal(check([title, { name: 'Моё Поле', label: 'X', kind: 'text' }]).ok, false)
    assert.equal(check([title, { name: '1field', label: 'X', kind: 'text' }]).ok, false)
    assert.equal(check([title, { name: 'repro-rate', label: 'X', kind: 'text' }]).ok, true)
  })

  it('выбор с одним вариантом — не выбор', () => {
    const result = check([
      title,
      {
        name: 'plan',
        label: 'Тариф',
        kind: 'select',
        options: [{ value: 'pro', label: 'Про' }],
      },
    ])
    assert.equal(result.ok, false)
  })

  it('повторяющиеся значения вариантов отбрасываются', () => {
    const result = check([
      title,
      {
        name: 'plan',
        label: 'Тариф',
        kind: 'select',
        options: [
          { value: 'pro', label: 'Про' },
          { value: 'pro', label: 'Про ещё раз' },
        ],
      },
    ])
    /* Осталось одно значение — значит выбора нет. */
    assert.equal(result.ok, false)
  })

  it('системное поле нельзя превратить в другое', () => {
    const result = check([
      title,
      { name: 'severity', label: 'Насколько мешает', kind: 'text' },
    ])
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.problems[0]!.message, /системное/)
  })

  it('системное поле можно переименовать и сделать необязательным', () => {
    const result = check([
      title,
      {
        name: 'severity',
        label: 'Насколько это мешает вам работать',
        kind: 'select',
        required: false,
        options: [
          { value: 'blocker', label: 'Блокирует' },
          { value: 'minor', label: 'Мелочь' },
        ],
      },
    ])
    assert.equal(result.ok, true)
    assert.equal(
      result.ok ? result.fields[1]!.label : '',
      'Насколько это мешает вам работать',
    )
  })

  it('предел длины — целое число в разумных границах', () => {
    assert.equal(check([{ ...title, maxLength: 0 }]).ok, false)
    assert.equal(check([{ ...title, maxLength: 1.5 }]).ok, false)
    assert.equal(check([{ ...title, maxLength: 120 }]).ok, true)
  })

  it('лишние свойства не проходят в базу', () => {
    const result = check([
      { ...title, whatever: 'мусор', options: [{ value: 'a', label: 'A' }] },
    ])
    assert.equal(result.ok, true)
    /* У текстового поля вариантов быть не может: вид решает набор свойств. */
    assert.deepEqual(Object.keys(result.ok ? result.fields[0]! : {}).sort(), [
      'kind',
      'label',
      'name',
      'required',
    ])
  })

  it('схема не список — понятная ошибка, а не падение', () => {
    assert.equal(checkSchema('строка').ok, false)
    assert.equal(checkSchema(null).ok, false)
  })
})

describe('значения свободных полей', () => {
  const schema: FormField[] = [
    title,
    { name: 'severity', label: 'Серьёзность', kind: 'select', required: false },
    { name: 'account', label: 'Номер договора', kind: 'text', required: false },
    { name: 'modules', label: 'Модули', kind: 'multiselect', required: false },
  ]

  it('системные поля не уезжают в custom_fields', () => {
    const custom = customValues(schema, {
      title: 'Не грузится',
      severity: 'blocker',
      account: 'Д-1024',
    })
    assert.deepEqual(custom, { account: 'Д-1024' })
    assert.equal(isSystemField('severity'), true)
    assert.equal(isSystemField('account'), false)
  })

  it('пустые значения не сохраняются', () => {
    const custom = customValues(schema, { account: '', modules: [] })
    assert.deepEqual(custom, {})
  })

  it('список сохраняется списком', () => {
    const custom = customValues(schema, { modules: ['reports', 'export'] })
    assert.deepEqual(custom, { modules: ['reports', 'export'] })
  })
})
