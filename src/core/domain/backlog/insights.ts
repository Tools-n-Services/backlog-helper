/**
 * Инсайты: фидбэк, который пришёл не в портал (FR-621..624).
 *
 * Большая часть ценного сказанного живёт в саппорте, на звонках и в чатах.
 * Приоритизация, которая видит только портал, видит самых громких, а не
 * самых важных: enterprise-клиент почти никогда не идёт голосовать —
 * он говорит это своему менеджеру.
 *
 * Хранится дословная цитата, а не пересказ. Пересказ — это уже вывод
 * команды, и на встрече он ничего не доказывает: «им неудобно» и «мы
 * держим для этого отдельного человека» — разные аргументы, хотя пересказ
 * из них получается одинаковый.
 */

import { prisma } from '@/core/db'
import { recalculateBacklogScores } from './scoring'

export type InsightSourceKey = 'call' | 'ticket' | 'chat' | 'interview' | 'sales' | 'other'

export const insightSources: { key: InsightSourceKey; name: string }[] = [
  { key: 'call', name: 'Звонок' },
  { key: 'ticket', name: 'Тикет' },
  { key: 'chat', name: 'Чат' },
  { key: 'interview', name: 'Интервью' },
  { key: 'sales', name: 'Продажи' },
  { key: 'other', name: 'Другое' },
]

export const insightSourceName = (key: string): string =>
  insightSources.find((s) => s.key === key)?.name ?? key

export type InsightOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'quote-required' | 'not-found' }

export interface AddInsightInput {
  backlogItemId: string
  quote: string
  source?: InsightSourceKey
  sourceUrl?: string | null
  /** Почта того, кто это сказал: если человек есть на портале, охват его не удвоит. */
  authorEmail?: string | null
  companyId?: string | null
}

/**
 * Добавить цитату к работе.
 *
 * Автор ищется по почте и не заводится: инсайт — это запись о сказанном,
 * а не приглашение на портал. Заводить аккаунт человеку, который про портал
 * не знает, значит однажды прислать ему письмо о статусе обращения,
 * которого он не создавал.
 */
export async function addInsight(input: AddInsightInput): Promise<InsightOutcome> {
  const quote = input.quote.trim()
  if (quote.length < 3) return { ok: false, reason: 'quote-required' }

  const item = await prisma.backlogItem.findUnique({
    where: { id: input.backlogItemId },
    select: { id: true },
  })
  if (!item) return { ok: false, reason: 'not-found' }

  const email = input.authorEmail?.trim().toLowerCase()
  const author = email
    ? await prisma.appUser.findUnique({ where: { email }, select: { id: true, companyId: true } })
    : null

  const insight = await prisma.insight.create({
    data: {
      backlogItemId: item.id,
      quote,
      source: input.source ?? 'other',
      sourceUrl: input.sourceUrl?.trim() || null,
      authorId: author?.id ?? null,
      /* Компания берётся из человека, если её не назвали явно: деньги
         считаются по компаниям, и терять их из-за незаполненного поля
         обиднее всего. */
      companyId: input.companyId || author?.companyId || null,
    },
    select: { id: true },
  })

  /* Пересчёт сразу: цитата добавлена ради того, чтобы увидеть, как она
     меняет приоритет. Через шесть часов это уже не разговор о приоритете. */
  await recalculateBacklogScores(item.id)

  return { ok: true, id: insight.id }
}

export async function removeInsight(insightId: string): Promise<void> {
  const insight = await prisma.insight.findUnique({
    where: { id: insightId },
    select: { backlogItemId: true },
  })
  if (!insight) return

  await prisma.insight.delete({ where: { id: insightId } })
  if (insight.backlogItemId) await recalculateBacklogScores(insight.backlogItemId)
}

export interface CompanyOption {
  id: string
  name: string
  monthlySpend: number | null
}

/** Компании для выбора в форме: их немного, поиск не нужен. */
export async function listCompanies(): Promise<CompanyOption[]> {
  const rows = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, monthlySpend: true },
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    monthlySpend: c.monthlySpend === null ? null : Number(c.monthlySpend),
  }))
}
