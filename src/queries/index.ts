/**
 * Точка входа слоя запросов. UI импортирует только этот модуль и типы —
 * не реализации (см. правило в eslint.config.mjs и docs/08-dev-plan.md).
 *
 * Переключение источника: DATA_SOURCE=mock|db.
 */

import { mockQueries } from './mock'
import type { QueryPort } from './types'

const source = process.env.DATA_SOURCE ?? 'mock'

const notImplemented: QueryPort = new Proxy({} as QueryPort, {
  get(_target, prop) {
    return () => {
      throw new Error(
        `DATA_SOURCE=db: реализация queries/db появится в итерации B1 (запрошен ${String(prop)}).`,
      )
    }
  },
})

export const queries: QueryPort = source === 'db' ? notImplemented : mockQueries

export * from './types'
