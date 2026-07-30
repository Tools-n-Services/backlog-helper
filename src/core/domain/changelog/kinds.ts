/**
 * Типы изменений внутри записи (FR-162).
 *
 * Отдельный модуль без единого импорта из инфраструктуры — и это не вопрос
 * вкуса: редактор релиза работает в браузере, а список типов ему нужен,
 * чтобы нарисовать выбор. Лежи он рядом с мутациями, в клиентскую сборку
 * уехал бы драйвер Postgres со всей его зависимостью от `fs` и `module`.
 *
 * Значения — перечисление в базе, поэтому форк меняет здесь названия,
 * а не набор: новый тип требует миграции.
 */

export type ChangeKindKey = 'new' | 'improved' | 'fixed'

export const changeKinds: { key: ChangeKindKey; name: string }[] = [
  { key: 'new', name: 'Новое' },
  { key: 'improved', name: 'Улучшено' },
  { key: 'fixed', name: 'Исправлено' },
]

export const changeKindName = (key: string): string =>
  changeKinds.find((k) => k.key === key)?.name ?? key
