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
import { deliverRelease, deliverReply, deliverStatusChange } from '@/core/mail'
import { wantsLetter } from './notification-prefs'

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
      /* Отметка релиза меняет само письмо: у выпуска своя формулировка
         и ссылка на запись changelog (FR-303). */
      releaseEntry: { select: { slug: true, title: true } },
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
      select: {
        token: true,
        user: { select: { email: true, notificationPrefs: true } },
      },
    })

    let failures = 0
    for (const subscriber of subscribers) {
      /* Настройка человека сильнее подписки: подписка отвечает на вопрос
         «за каким обращением слежу», настройка — «о чём писать».

         Выпуск проверяется той же настройкой «смена статуса», а не своей:
         обещать отдельный переключатель, за которым стоит то же событие
         в жизни обращения, значит плодить настройки, разницу между которыми
         не объяснить. Кто отказался от писем о судьбе обращения, отказался
         и от этого. */
      if (!wantsLetter(subscriber.user.notificationPrefs, 'status')) continue

      const postUrl = `${origin}/${change.post.board.slug}/p/${change.post.slug}`
      /* Отписка одним переходом, без входа: требовать авторизацию
         у человека, который хочет перестать получать письма, — верный
         способ получить жалобу на спам вместо отписки (FR-305). */
      const unsubscribeUrl = `${origin}/unsubscribe/confirm?token=${subscriber.token}`

      const sent = change.releaseEntry
        ? await deliverRelease({
            to: subscriber.user.email,
            postTitle: change.post.title,
            postUrl,
            releaseTitle: change.releaseEntry.title,
            releaseUrl: `${origin}/changelog/${change.releaseEntry.slug}`,
            unsubscribeUrl,
          })
        : await deliverStatusChange({
            to: subscriber.user.email,
            postTitle: change.post.title,
            postUrl,
            statusName: status?.name ?? change.toStatus.key,
            note: change.note,
            unsubscribeUrl,
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

/**
 * Ответы в обсуждении, о которых ещё не писали (FR-302).
 *
 * Очередь — сами комментарии с `notified_at is null`, тем же приёмом, что
 * и смена статуса: событие уже существует строкой, отдельная таблица задач
 * ради этого не нужна.
 *
 * Внутренние заметки команды не рассылаются никогда (FR-139), удалённые —
 * тоже: человек стёр комментарий, и письмо о нём было бы худшим исходом.
 */
export async function pendingReplies(limit = BATCH) {
  return prisma.comment.findMany({
    where: { notifiedAt: null, deletedAt: null, internal: false },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      body: true,
      authorId: true,
      author: { select: { name: true } },
      parent: { select: { authorId: true } },
      post: {
        select: {
          id: true,
          slug: true,
          title: true,
          authorId: true,
          board: { select: { slug: true } },
        },
      },
    },
  })
}

/**
 * Кому идёт письмо об ответе.
 *
 * Ответ на комментарий — его автору; ответ в обсуждении — автору обращения.
 * Не всем подписчикам: подписка на обращение означает «сообщайте о судьбе»,
 * а не «присылайте каждую реплику», и рассылка каждого комментария сорока
 * голосовавшим — это ровно тот шум, из-за которого отписываются насовсем.
 *
 * Себе письмо не уходит: человек знает, что он написал.
 */
function replyRecipientId(reply: Awaited<ReturnType<typeof pendingReplies>>[number]) {
  const target = reply.parent ? reply.parent.authorId : reply.post.authorId
  if (!target || target === reply.authorId) return null
  return target
}

export interface ReplyDispatchResult {
  replies: number
  letters: number
  failed: number
}

export async function dispatchReplies(origin: string): Promise<ReplyDispatchResult> {
  const replies = await pendingReplies()
  const result: ReplyDispatchResult = { replies: 0, letters: 0, failed: 0 }

  for (const reply of replies) {
    const recipientId = replyRecipientId(reply)

    /* Некому писать — это тоже разобранная очередь, а не повод возвращаться
       к этой строке в каждом следующем проходе. */
    if (!recipientId) {
      await markReplySent(reply.id)
      result.replies++
      continue
    }

    const recipient = await prisma.appUser.findUnique({
      where: { id: recipientId },
      select: { email: true, notificationPrefs: true },
    })
    const subscription = await prisma.subscription.findUnique({
      where: { postId_userId: { postId: reply.post.id, userId: recipientId } },
      select: { token: true, unsubscribedAt: true },
    })

    const wanted =
      recipient !== null &&
      wantsLetter(recipient.notificationPrefs, 'replies') &&
      subscription?.unsubscribedAt == null

    if (!wanted) {
      await markReplySent(reply.id)
      result.replies++
      continue
    }

    const sent = await deliverReply({
      to: recipient.email,
      postTitle: reply.post.title,
      postUrl: `${origin}/${reply.post.board.slug}/p/${reply.post.slug}`,
      authorName: reply.author?.name ?? 'Участник',
      body: reply.body,
      isReplyToComment: reply.parent !== null,
      unsubscribeUrl: subscription
        ? `${origin}/unsubscribe/confirm?token=${subscription.token}`
        : `${origin}/profile?tab=notifications`,
    })

    if (sent.ok) {
      await markReplySent(reply.id)
      result.replies++
      result.letters++
    } else {
      result.failed++
    }
  }

  return result
}

async function markReplySent(id: string) {
  await prisma.comment.update({ where: { id }, data: { notifiedAt: new Date() } })
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
