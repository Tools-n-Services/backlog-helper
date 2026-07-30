/**
 * Схема формы: каталог видов полей и проверка (В3, docs/09-install.md).
 *
 * Схему теперь правит человек в админке, а не компилятор в сборке. Значит
 * появляется то, чего раньше не было: схема может быть неверной. Раньше это
 * ловил TypeScript до выкладки, теперь ловить обязан этот модуль — до записи
 * в базу, а не после, когда сломанная форма уже открыта людям.
 *
 * Граница, которая остаётся: **вид поля — код, состав полей — данные**.
 * Каждый вид умеет рисоваться, проверяться и сохраняться; мастер комбинирует
 * виды, называет поля и делает их обязательными. Новый вид добавляется кодом.
 *
 * Модуль чистый — ни Prisma, ни запросов: его импортирует и редактор схемы
 * в браузере, и проверка на сервере, и обе стороны обязаны судить одинаково.
 */

import type { FieldKind, FormField } from '@config/post-types'

export interface FieldKindInfo {
  key: FieldKind
  name: string
  /** Нужны варианты выбора: без них поле бессмысленно. */
  options: boolean
  placeholder: boolean
  maxLength: boolean
}

/** Виды полей, которые умеет рисовать форма. Расширяется только кодом. */
export const fieldKinds: FieldKindInfo[] = [
  { key: 'text', name: 'Строка', options: false, placeholder: true, maxLength: true },
  { key: 'textarea', name: 'Текст', options: false, placeholder: true, maxLength: true },
  { key: 'select', name: 'Выбор одного', options: true, placeholder: false, maxLength: false },
  {
    key: 'multiselect',
    name: 'Выбор нескольких',
    options: true,
    placeholder: false,
    maxLength: false,
  },
  { key: 'checkbox', name: 'Галочка', options: false, placeholder: true, maxLength: false },
  { key: 'url', name: 'Ссылка', options: false, placeholder: true, maxLength: true },
  {
    key: 'environment',
    name: 'Окружение',
    options: false,
    placeholder: false,
    maxLength: false,
  },
  {
    key: 'attachments',
    name: 'Вложения',
    options: false,
    placeholder: false,
    maxLength: false,
  },
]

export const fieldKindByKey = new Map(fieldKinds.map((k) => [k.key, k]))

/**
 * Поля, у которых есть логика за пределами формы.
 *
 * Их имена и виды зафиксированы: `severity` кормит SLA и очередь триажа,
 * `environment` и `frequency` участвуют в дедупликации, `diagnostics` никогда
 * не показывается публично. Переименовать подпись, переставить, сделать
 * необязательным или убрать из формы — можно. Поменять смысл — нет: тогда
 * приоритизация начнёт считать не то, и заметить это будет нечем.
 */
export interface SystemFieldInfo {
  name: string
  kind: FieldKind
  /** Где живёт значение — колонка обращения, а не `custom_fields`. */
  column: string
  /** Почему поле системное: показывается в редакторе рядом с замком. */
  why: string
  /** Без него обращение не существует: убрать из формы нельзя. */
  required?: boolean
}

export const systemFields: SystemFieldInfo[] = [
  {
    name: 'title',
    kind: 'text',
    column: 'title',
    why: 'Заголовок обращения: по нему ищут, объединяют дубликаты и называют его в письмах.',
    required: true,
  },
  {
    name: 'details',
    kind: 'textarea',
    column: 'details',
    why: 'Тело обращения.',
  },
  /* Поля тела багрепорта. Они не имеют своей колонки, но и не свободные:
     из них собирается текст обращения подписанными абзацами — так «что
     ожидалось» читается, а слитое в один поток нет. Свободное поле вместо
     этого показывается отдельной строкой на обращении: иначе одно и то же
     значение оказалось бы на странице дважды. */
  {
    name: 'actual',
    kind: 'textarea',
    column: 'details',
    why: 'Часть тела обращения: собирается в текст подписанным абзацем.',
  },
  {
    name: 'expected',
    kind: 'textarea',
    column: 'details',
    why: 'Часть тела обращения: собирается в текст подписанным абзацем.',
  },
  {
    name: 'steps',
    kind: 'textarea',
    column: 'details',
    why: 'Часть тела обращения: собирается в текст подписанным абзацем.',
  },
  {
    name: 'severity',
    kind: 'select',
    column: 'severity',
    why: 'Оценка репортера: задаёт срок первого ответа и порядок в очереди триажа.',
  },
  {
    name: 'frequency',
    kind: 'select',
    column: 'frequency',
    why: 'Как часто повторяется: участвует в разборе и дедупликации ошибок.',
  },
  {
    name: 'startedAt',
    kind: 'text',
    column: 'started_at',
    why: 'Отделяет регрессию от «всегда так было».',
  },
  {
    name: 'environment',
    kind: 'environment',
    column: 'environment',
    why: 'Собирается автоматически и уходит в диагностику, которая не видна публично.',
  },
  {
    name: 'attachments',
    kind: 'attachments',
    column: 'attachment',
    why: 'Файлы живут отдельной таблицей со своими правами доступа и сроком хранения.',
  },
]

export const systemFieldByName = new Map(systemFields.map((f) => [f.name, f]))

export function isSystemField(name: string): boolean {
  return systemFieldByName.has(name)
}

/** Поле собирается в тело обращения, а не показывается отдельной строкой. */
export function goesToBody(name: string): boolean {
  return systemFieldByName.get(name)?.column === 'details'
}

/** Имя поля: латиница, цифры и дефис — оно попадает в ключи `custom_fields`. */
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

export interface SchemaProblem {
  /** Индекс поля в схеме; -1 — проблема всей схемы. */
  index: number
  message: string
}

export type SchemaCheck =
  | { ok: true; fields: FormField[] }
  | { ok: false; problems: SchemaProblem[] }

/**
 * Проверить схему перед записью.
 *
 * Строго, в отличие от чтения: на чтении непригодное поле отбрасывается,
 * чтобы портал не падал от чужой ошибки, а на записи ошибку нужно назвать —
 * тому, кто её только что сделал, и пока он ещё смотрит на экран.
 */
export function checkSchema(input: unknown): SchemaCheck {
  const problems: SchemaProblem[] = []
  if (!Array.isArray(input)) {
    return { ok: false, problems: [{ index: -1, message: 'Схема должна быть списком полей' }] }
  }

  const fields: FormField[] = []
  const names = new Set<string>()

  input.forEach((raw, index) => {
    const add = (message: string) => problems.push({ index, message })

    if (typeof raw !== 'object' || raw === null) {
      add('Поле должно быть объектом')
      return
    }
    const field = raw as Partial<FormField>

    const name = typeof field.name === 'string' ? field.name.trim() : ''
    if (!NAME_PATTERN.test(name)) {
      add('Имя: латиница, цифры и дефис, до 40 символов, начинается с буквы')
      return
    }
    if (names.has(name)) {
      add(`Имя «${name}» уже занято другим полем`)
      return
    }
    names.add(name)

    const kind = field.kind as FieldKind
    const kindInfo = kind ? fieldKindByKey.get(kind) : undefined
    if (!kindInfo) {
      add(`Неизвестный вид поля: ${String(field.kind)}`)
      return
    }

    /* Системное поле остаётся собой: его вид завязан на колонку и на код,
       который эту колонку читает. */
    const system = systemFieldByName.get(name)
    if (system && system.kind !== kind) {
      add(`Поле «${name}» системное: вид обязан остаться «${system.kind}»`)
      return
    }

    const label = typeof field.label === 'string' ? field.label.trim() : ''
    if (!label) {
      add('Подпись не может быть пустой: человек должен понимать, что вводит')
      return
    }

    const checked: FormField = {
      name,
      label,
      kind,
      required: field.required === true,
    }

    if (kindInfo.options) {
      const options = Array.isArray(field.options) ? field.options : []
      const values = new Set<string>()
      const cleaned = options.flatMap((option) => {
        if (typeof option !== 'object' || option === null) return []
        const value = typeof option.value === 'string' ? option.value.trim() : ''
        const optionLabel = typeof option.label === 'string' ? option.label.trim() : ''
        if (!value || !optionLabel || values.has(value)) return []
        values.add(value)
        return [{ value, label: optionLabel, ...(option.labelEn ? { labelEn: option.labelEn } : {}) }]
      })
      /* Один вариант — это не выбор, а обязательное значение, которое человек
         вынужден подтвердить. Такое поле лучше не показывать вовсе. */
      if (cleaned.length < 2) {
        add('Нужно хотя бы два непустых варианта с разными значениями')
        return
      }
      checked.options = cleaned
    }

    if (field.hint) checked.hint = String(field.hint)
    if (kindInfo.placeholder && field.placeholder) {
      checked.placeholder = String(field.placeholder)
    }
    if (kindInfo.maxLength && field.maxLength !== undefined) {
      const max = Number(field.maxLength)
      if (!Number.isInteger(max) || max < 1 || max > 100_000) {
        add('Предел длины: целое число от 1 до 100 000')
        return
      }
      checked.maxLength = max
    }
    for (const key of ['labelEn', 'hintEn', 'placeholderEn'] as const) {
      const value = field[key]
      if (typeof value === 'string' && value.trim()) checked[key] = value.trim()
    }

    fields.push(checked)
  })

  /* Обращение без заголовка не существует: его нечем назвать в ленте,
     в письме и в очереди. */
  for (const system of systemFields.filter((f) => f.required)) {
    if (!names.has(system.name)) {
      problems.push({ index: -1, message: `Поле «${system.name}» обязательно для любого типа` })
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, fields }
}

/**
 * Значения полей, у которых нет своей колонки.
 *
 * Свободные поля уходят в `custom_fields` как есть: они показываются
 * на обращении и в письмах, но в логику не лезут — ни в SLA, ни в очередь,
 * ни в приоритизацию. Это и есть цена свободы их заводить.
 */
export function customValues(
  fields: FormField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const custom: Record<string, unknown> = {}
  for (const field of fields) {
    if (isSystemField(field.name)) continue
    const value = values[field.name]
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    custom[field.name] = value
  }
  return custom
}
