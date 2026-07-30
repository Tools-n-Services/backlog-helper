/**
 * Тексты готового перевода для e2e (FR-181).
 *
 * Отдельным файлом без единого импорта: их читают и сценарий, и скрипт
 * подготовки базы, а тащить Prisma в процесс Playwright ради двух строк
 * незачем.
 */

export const TRANSLATED = {
  title: 'Excel export loses night shifts',
  body: 'The export drops every shift that crosses midnight.',
  comment: 'It happens every Monday, right after the weekly copy.',
}
