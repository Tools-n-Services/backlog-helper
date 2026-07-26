'use client'

import { useSyncExternalStore } from 'react'

import { collectEnvironment, environmentToText } from '@/core/domain/intake/environment'

/**
 * Окружение браузера как внешний источник данных.
 *
 * Через `useSyncExternalStore`, а не через эффект с `setState`: значение
 * существует только на клиенте, но компонент рендерится и на сервере.
 * Серверный снапшот пустой, клиентский считается один раз и не меняется —
 * подписка поэтому пустая.
 */

const noopSubscribe = () => () => {}

let cached: string | null = null

function clientSnapshot(): string {
  cached ??= environmentToText(collectEnvironment())
  return cached
}

const serverSnapshot = () => ''

export function useEnvironmentText(): string {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot)
}
