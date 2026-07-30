/**
 * Проверка формы по схеме типа обращения (FR-502).
 *
 * Ни одного условия по ключу типа: правила целиком описаны полями схемы.
 * Добавить продукту тип «инцидент» со своими полями должно быть правкой
 * config/post-types.ts, а не этого файла.
 */

import type { FormField } from '@config/post-types'

export type FormValues = Record<string, string | string[] | boolean>

export type FieldErrors = Record<string, string>

function isEmpty(value: FormValues[string] | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value === false
  if (Array.isArray(value)) return value.length === 0
  return value.trim().length === 0
}

function checkField(field: FormField, value: FormValues[string] | undefined): string | null {
  if (field.required && isEmpty(value)) {
    return 'Обязательное поле'
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    if (field.maxLength && value.trim().length > field.maxLength) {
      return `Не длиннее ${field.maxLength} символов`
    }
    /* Нижняя граница заголовка — из FR-121: три символа. */
    if (field.kind === 'text' && field.required && value.trim().length < 3) {
      return 'Слишком коротко, чтобы понять суть'
    }
    if (field.kind === 'url' && !/^https?:\/\/\S+$/.test(value.trim())) {
      return 'Нужна ссылка, начинающаяся с http:// или https://'
    }
  }
  return null
}

export function validateSubmission(
  /* Достаточно схемы: проверке безразлично, откуда тип — из справочника
     базы или из пресета. */
  type: { formSchema: FormField[] },
  values: FormValues,
  options: { requireCategory: boolean } = { requireCategory: false },
): FieldErrors {
  const errors: FieldErrors = {}

  for (const field of type.formSchema) {
    const error = checkField(field, values[field.name])
    if (error) errors[field.name] = error
  }

  /* Категория — общее поле формы, её обязательность задаётся доской (FR-121). */
  if (options.requireCategory && isEmpty(values['category'])) {
    errors['category'] = 'Выберите категорию'
  }

  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
