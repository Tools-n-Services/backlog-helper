/**
 * Какие письма человек хочет получать (FR-307).
 *
 * Список намеренно короткий: в нём ровно те виды писем, которые продукт
 * действительно отправляет. Переключатель, за которым ничего нет, хуже
 * его отсутствия — человек считает, что настроил почту, а она приходит
 * как раньше, и следующим он нажимает «спам». После этого страдает
 * доставка всех остальных писем продукта, включая ссылки для входа.
 *
 * Поэтому правило: новый переключатель появляется здесь вместе с рассылкой,
 * которой он управляет, а не заранее.
 */

export type NotificationKind = 'status' | 'replies'

export interface NotificationKindInfo {
  key: NotificationKind
  title: string
  /** Что именно придёт и как часто — иначе настройка не поддаётся оценке. */
  hint: string
  /** То же по-английски (FR-181). */
  titleEn?: string
  hintEn?: string
}

export const NOTIFICATION_KINDS: NotificationKindInfo[] = [
  {
    key: 'status',
    title: 'Смена статуса моих обращений',
    hint: 'Одно письмо на переход, с текстом решения команды. Внутренние этапы работы не рассылаются.',
    titleEn: 'Status changes on my requests',
    hintEn: 'One email per change, with the team\u2019s decision. Internal work stages are not mailed out.',
  },
  {
    key: 'replies',
    title: 'Ответы в обсуждении',
    hint: 'Когда команда или другой участник отвечает на ваше обращение или на ваш комментарий.',
    titleEn: 'Replies in the discussion',
    hintEn: 'When the team or another participant replies to your request or to your comment.',
  },
]

export type NotificationPrefs = Record<NotificationKind, boolean>

/**
 * Умолчание — всё включено.
 *
 * Человек подписывается на обращение осознанно: голосом, комментарием или
 * кнопкой «следить». Молчать по умолчанию значит не выполнить то, о чём
 * он попросил.
 */
export const DEFAULT_PREFS: NotificationPrefs = {
  status: true,
  replies: true,
}

/**
 * Читает настройки из колонки `notification_prefs`.
 *
 * Всё, чего в json нет, берётся из умолчания: старые строки, записанные
 * до появления нового вида письма, не должны молча его отключать.
 */
export function readPrefs(value: unknown): NotificationPrefs {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const prefs = { ...DEFAULT_PREFS }
  for (const kind of NOTIFICATION_KINDS) {
    const raw = stored[kind.key]
    if (typeof raw === 'boolean') prefs[kind.key] = raw
  }
  return prefs
}

/** Хочет ли человек письмо такого вида. */
export function wantsLetter(value: unknown, kind: NotificationKind): boolean {
  return readPrefs(value)[kind]
}
