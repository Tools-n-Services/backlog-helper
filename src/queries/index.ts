/**
 * Точка входа слоя запросов. UI импортирует только этот модуль и типы —
 * не реализацию (см. правило в eslint.config.mjs и docs/08-dev-plan.md).
 *
 * Реализация одна, но слой остаётся: он держит границу, из-за которой
 * экраны не знают ни про Prisma, ни про форму строк в базе и получают
 * готовые к рендеру данные.
 *
 * Здесь же — единственное место, где загружаются справочники (В1). Мапперы
 * читают их синхронно, значит снимок обязан быть свежим к моменту вызова.
 * Обёртка делает это сразу за все методы: добавить метод и забыть про
 * загрузку нельзя, а это ровно та ошибка, которая проявилась бы не сразу
 * и не у всех.
 */

import { loadCatalog } from '@/core/catalog'

import { dbQueries } from './db'
import type { QueryPort } from './types'

export const queries: QueryPort = new Proxy(dbQueries, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver) as unknown
    if (typeof value !== 'function') return value

    const method = value as (...args: unknown[]) => Promise<unknown>
    return async (...args: unknown[]) => {
      await loadCatalog()
      return method.apply(target, args)
    }
  },
})

export * from './types'
