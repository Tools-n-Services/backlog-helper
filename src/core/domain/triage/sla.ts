/**
 * SLA первого ответа (FR-538).
 *
 * Считается один раз при приёме обращения и живёт на нём полем `sla_due_at`
 * (02-data-model.md). Здесь — правило, по которому оно вычисляется, и три
 * состояния таймера для очереди.
 */

import { slaPolicies, slaWarningHours, type SeverityKey } from '@config/scoring'

const MS_PER_HOUR = 3_600_000

/**
 * Первая подходящая политика: частные правила стоят выше общих.
 * null — у этого типа срока первого ответа нет.
 */
export function firstResponseHours(
  typeKey: string,
  severity: SeverityKey | null,
): number | null {
  const policy = slaPolicies.find(
    (p) =>
      (p.typeKey === null || p.typeKey === typeKey) &&
      (p.severity === null || p.severity === severity),
  )
  return policy?.firstResponseHours ?? null
}

export function slaDueAt(
  createdAt: Date,
  typeKey: string,
  severity: SeverityKey | null,
): Date | null {
  const hours = firstResponseHours(typeKey, severity)
  return hours === null ? null : new Date(createdAt.getTime() + hours * MS_PER_HOUR)
}

export type SlaState = 'answered' | 'ok' | 'soon' | 'overdue' | 'none'

export interface SlaView {
  state: SlaState
  /** Часы до срока; отрицательные — просрочка. */
  hoursLeft: number
  /** Готовая подпись для плотной строки: «4 ч», «−2 ч», «отвечено». */
  label: string
}

export function slaState(
  dueAt: Date | null,
  now: Date,
  firstResponseAt: Date | null,
): SlaView {
  if (firstResponseAt) {
    return { state: 'answered', hoursLeft: 0, label: 'отвечено' }
  }
  if (dueAt === null) {
    return { state: 'none', hoursLeft: Infinity, label: '—' }
  }

  const hoursLeft = (dueAt.getTime() - now.getTime()) / MS_PER_HOUR
  const state: SlaState =
    hoursLeft < 0 ? 'overdue' : hoursLeft <= slaWarningHours ? 'soon' : 'ok'

  return { state, hoursLeft, label: formatHours(hoursLeft) }
}

/** Компактно и с табличными цифрами: «3 ч», «2 д», «−5 ч». */
function formatHours(hours: number): string {
  const sign = hours < 0 ? '−' : ''
  const abs = Math.abs(hours)
  if (abs < 1) return `${sign}${Math.max(1, Math.round(abs * 60))} мин`
  if (abs < 48) return `${sign}${Math.round(abs)} ч`
  return `${sign}${Math.round(abs / 24)} д`
}
