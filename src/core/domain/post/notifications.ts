/**
 * Рассылка подписчикам при смене публичного статуса (FR-301, FR-309).
 *
 * Очередь берётся из таблицы `status_change`, а не из кода, который меняет
 * статус. Это прямое требование модели данных, и причина простая: почта
 * ненадёжна. Если отправлять письмо прямо в транзакции смены статуса,
 * упавший почтовый сервис откатит саму смену — обращение останется
 * в старом статусе, потому что кому-то не доставили письмо.
 *
 * Поэтому смена статуса просто оставляет строку с `notified_at is null`,
 * а отправкой занимается отдельный проход (`pnpm worker`). Он может падать,
 * перезапускаться и отставать — статус от этого не страдает.
 */

import { product } from '@config/product'
import { statusByKey } from '@config/statuses'
import { prisma } from '@/core/db'
import { deliverStatusChange } from '@/core/mail'

/** Сколько переходов разбирать за один проход. */
const BATCH = 50

/**
 * Переходы, о которых ещё не рассылали.
 *
 * Внутренние переходы бэклога сюда не попадают вовсе: письма уходят только
 * при смене ПУБЛИЧНОГО статуса (FR-634). Иначе на активной задаче человек
 * получит пять писем за неделю и отпишется навсегда.
 */
export async function pendingNotifications(limit = BATCH) {
  return prisma.statusChange.findMany({
    where: {
      notifiedAt: null,
      /* Первая запись обращения — это его создание, а не смена статуса:
         рассылать «статус изменился на Новое» тому, кто только что его
         и создал, незачем. */
      fromStatusId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      note: true,
      toStatus: { select: { key: true } },
      post: {
        select: {
          id: true,
          slug: true,
          title: true,
          board: { select: { slug: true } },
        },
      },
    },
  })
}

export interface DispatchResult {
  changes: number
  letters: number
  failed: number
}

/**
 * Разбирает очередь: на каждый переход письма всем подписчикам.
 *
 * Переход помечается разосланным, только если ни одно письмо не упало.
 * Иначе он останется в очереди и попадёт в следующий проход — лучше
 * прислать кому-то второе письмо, чем не прислать первое.
 */
export async function dispatchNotifications(origin: string): Promise<DispatchResult> {
  const changes = await pendingNotifications()
  const result: DispatchResult = { changes: 0, letters: 0, failed: 0 }

  for (const change of changes) {
    const status = statusByKey.get(change.toStatus.key)
    const subscribers = await prisma.subscription.findMany({
      where: { postId: change.post.id, unsubscribedAt: null },
      select: { token: true, user: { select: { email: true } } },
    })

    let failures = 0
    for (const subscriber of subscribers) {
      const sent = await deliverStatusChange({
        to: subscriber.user.email,
        postTitle: change.post.title,
        postUrl: `${origin}/${change.post.board.slug}/p/${change.post.slug}`,
        statusName: status?.name ?? change.toStatus.key,
        note: change.note,
        /* Отписка одним переходом, без входа: требовать авторизацию
           у человека, который хочет перестать получать письма, — верный
           способ получить жалобу на спам вместо отписки (FR-305). */
        unsubscribeUrl: `${origin}/unsubscribe/confirm?token=${subscriber.token}`,
      })
      if (sent.ok) result.letters++
      else failures++
    }

    if (failures === 0) {
      await prisma.statusChange.update({
        where: { id: change.id },
        data: { notifiedAt: new Date() },
      })
      result.changes++
    } else {
      result.failed += failures
    }
  }

  return result
}

export type UnsubscribeResult =
  | { ok: true; postTitle: string }
  | { ok: false; reason: 'unknown-token' }

/**
 * Отписка по токену из письма (FR-305).
 *
 * Без входа и в один переход: если отписка требует вспомнить пароль,
 * человек нажмёт «спам» — и следующие письма продукта не увидит уже никто.
 *
 * Строка подписки не удаляется, а помечается `unsubscribed_at`: иначе
 * следующий голос за то же обращение подпишет заново, и отписавшийся
 * начнёт получать письма снова.
 */
export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  if (!token) return { ok: false, reason: 'unknown-token' }

  const subscription = await prisma.subscription.findUnique({
    where: { token },
    select: { id: true, post: { select: { title: true } } },
  })
  if (!subscription) return { ok: false, reason: 'unknown-token' }

  /* Повторный переход по той же ссылке не ошибка: письмо могло прийти
     дважды, и человек имеет право нажать ещё раз. Время первой отписки
     при этом сохраняется. */
  await prisma.subscription.updateMany({
    where: { id: subscription.id, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  })

  return { ok: true, postTitle: subscription.post.title }
}

/**
 * Адрес портала для ссылок в письмах.
 *
 * У фонового процесса нет входящего запроса, из которого можно взять хост,
 * поэтому он берётся из конфигурации продукта. Ошибиться здесь дорого:
 * ссылка в письме — единственный путь обратно на портал.
 */
export function portalOrigin(): string {
  return process.env.PORTAL_ORIGIN ?? `https://${product.domain}`
}
