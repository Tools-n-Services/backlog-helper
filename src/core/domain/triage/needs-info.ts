/**
 * Обращения, ждущие ответа автора (FR-533).
 *
 * «Нужна информация» — единственное решение триажа, которое передаёт ход
 * обратно человеку. Без сроков оно превращается в способ навсегда убрать
 * обращение из очереди, ничего не решив: метрика «ждёт автора» только растёт,
 * а обращение висит между открытым и закрытым.
 *
 * Поэтому два срока из `config/product.ts`:
 *
 *   напоминание — человек чаще всего просто не увидел письма;
 *   закрытие    — если не ответил и после напоминания, вопрос снят.
 *
 * Закрытие не окончательное: письмо называет причину и говорит, что ответ
 * в обсуждении открывает обращение заново. Дверь остаётся открытой — иначе
 * авто-закрытие читается как «от нас отмахнулись».
 */

import { product } from '@config/product'
import { prisma } from '@/core/db'
import { deliverNeedsInfoReminder } from '@/core/mail'

/** Статус, в который уходит обращение без ответа. */
const CLOSED_STATUS_KEY = 'no-response'

const MS_PER_DAY = 86_400_000

export interface NeedsInfoResult {
  reminded: number
  closed: number
  failed: number
}

/**
 * Напоминает и закрывает.
 *
 * Оба шага в одном проходе: они смотрят на одну колонку и разъезжаться
 * им незачем.
 */
export async function processStaleNeedsInfo(origin: string): Promise<NeedsInfoResult> {
  const result: NeedsInfoResult = { reminded: 0, closed: 0, failed: 0 }
  const now = Date.now()

  const remindBefore = new Date(now - product.needsInfo.remindAfterDays * MS_PER_DAY)
  const closeBefore = new Date(now - product.needsInfo.closeAfterDays * MS_PER_DAY)

  /* Сначала закрытие: обращение, которому пора закрываться, не должно
     сначала получить напоминание и письмо о закрытии следом. */
  result.closed = await closeStale(closeBefore)
  const reminded = await remindStale(remindBefore, closeBefore, origin)
  result.reminded = reminded.sent
  result.failed = reminded.failed

  return result
}

async function closeStale(closeBefore: Date): Promise<number> {
  const stale = await prisma.post.findMany({
    where: {
      needsInfoSince: { lt: closeBefore },
      /* Уже закрытые сюда не попадают: `needs_info_since` снимается
         при любом следующем решении. */
      status: { isTerminal: false },
      mergedIntoId: null,
    },
    select: { id: true, statusId: true },
  })
  if (stale.length === 0) return 0

  const closedStatus = await prisma.status.findUnique({
    where: { key: CLOSED_STATUS_KEY },
    select: { id: true },
  })
  if (!closedStatus) {
    throw new Error(
      `Статус «${CLOSED_STATUS_KEY}» не найден. Он нужен для авто-закрытия: pnpm db:seed`,
    )
  }

  const note =
    `Мы просили уточнить детали, но ответа не было ${product.needsInfo.closeAfterDays} дней. ` +
    'Закрываем — если вопрос ещё актуален, ответьте в обсуждении, и мы вернёмся к нему.'

  for (const post of stale) {
    /* Смена статуса и запись истории — одной транзакцией. Письмо отсюда
       не отправляется: его поставит в очередь строка status_change,
       и падение почты не откатит закрытие (FR-309). */
    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          statusId: closedStatus.id,
          statusChangedAt: new Date(),
          resolution: 'auto_closed',
          resolutionReasonPublic: note,
          resolvedAt: new Date(),
          needsInfoSince: null,
          needsInfoRemindedAt: null,
        },
      }),
      prisma.statusChange.create({
        data: {
          postId: post.id,
          fromStatusId: post.statusId,
          toStatusId: closedStatus.id,
          /* Без `changed_by`: закрыл не человек, а правило. Приписывать это
             последнему модератору значит соврать в истории обращения. */
          note,
        },
      }),
    ])
  }

  return stale.length
}

async function remindStale(
  remindBefore: Date,
  closeBefore: Date,
  origin: string,
): Promise<{ sent: number; failed: number }> {
  const waiting = await prisma.post.findMany({
    where: {
      needsInfoSince: { lt: remindBefore, gte: closeBefore },
      needsInfoRemindedAt: null,
      status: { isTerminal: false },
      mergedIntoId: null,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      needsInfoSince: true,
      board: { select: { slug: true } },
      author: { select: { email: true, notificationPrefs: true } },
      /* Последний комментарий команды — это и есть заданный вопрос.
         Напоминание без него бесполезно: человек не помнит, о чём речь. */
      comments: {
        where: { internal: false, deletedAt: null, author: { isTeam: true } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const post of waiting) {
    if (!post.author) {
      /* Автор анонимизирован — напоминать некому, но и возвращаться
         к этому обращению каждый проход незачем. */
      await markReminded(post.id)
      continue
    }

    const daysLeft = Math.max(
      1,
      Math.round(
        (post.needsInfoSince!.getTime() +
          product.needsInfo.closeAfterDays * MS_PER_DAY -
          Date.now()) /
          MS_PER_DAY,
      ),
    )

    const letter = await deliverNeedsInfoReminder({
      to: post.author.email,
      postTitle: post.title,
      postUrl: `${origin}/${post.board.slug}/p/${post.slug}`,
      question: post.comments[0]?.body ?? null,
      daysLeft,
    })

    if (letter.ok) {
      await markReminded(post.id)
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}

async function markReminded(id: string) {
  await prisma.post.update({
    where: { id },
    data: { needsInfoRemindedAt: new Date() },
  })
}
