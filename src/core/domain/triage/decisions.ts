/**
 * Решения триажа (FR-531..538) и объединение обращений (FR-211..213).
 *
 * Здесь живёт самая опасная операция продукта — merge. Она делается часто
 * и ошибочно тоже часто, поэтому её инварианты описаны в модели данных
 * построчно, и код ниже следует им буквально, а не «в целом».
 */

import { prisma } from '@/core/db'
import { decisionByKey } from './decision-specs'

/* Описания решений живут отдельно и без зависимостей от инфраструктуры:
   их импортирует клиентская очередь, и тянуть за ними драйвер Postgres
   в браузерную сборку нельзя. */
export { DECISIONS, decisionByKey, type DecisionSpec } from './decision-specs'

/* ─────────────────────── Решение по обращению ─────────────────────── */

export type DecisionOutcome =
  | { ok: true }
  | { ok: false; reason: 'unknown-decision' | 'reason-required' | 'not-found' }

/**
 * Применяет решение.
 *
 * Смена статуса пишется строкой `status_change`, а письма подписчикам ставятся
 * в очередь оттуда, а не отсюда: если рассылка упадёт, статус не должен
 * откатываться (FR-309).
 */
export async function applyDecision(
  postId: string,
  decisionKey: string,
  actorId: string,
  reason: string,
): Promise<DecisionOutcome> {
  const decision = decisionByKey.get(decisionKey)
  if (!decision) return { ok: false, reason: 'unknown-decision' }

  const text = reason.trim()
  if (decision.needsReason && text.length < 3) {
    return { ok: false, reason: 'reason-required' }
  }

  const [post, status] = await Promise.all([
    prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, statusId: true, firstResponseAt: true },
    }),
    prisma.status.findUnique({
      where: { key: decision.statusKey },
      select: { id: true },
    }),
  ])
  if (!post || !status) return { ok: false, reason: 'not-found' }

  const now = new Date()

  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        statusId: status.id,
        statusChangedAt: now,
        resolution: decision.resolution,
        resolutionReasonPublic: text || null,
        resolvedById: decision.resolution ? actorId : null,
        resolvedAt: decision.resolution ? now : null,
        /* Ждём автора — с этого момента считается напоминание
           и авто-закрытие (FR-533). */
        needsInfoSince: decision.awaitsReporter ? now : null,
        /* Решение — это и есть первый ответ, если его ещё не было. */
        firstResponseAt: post.firstResponseAt ?? now,
        assigneeId: actorId,
      },
    }),
    prisma.statusChange.create({
      data: {
        postId,
        fromStatusId: post.statusId,
        toStatusId: status.id,
        changedById: actorId,
        note: text || null,
        createdAt: now,
      },
    }),
  ])

  return { ok: true }
}

/** Назначение исполнителя (FR-537). */
export async function assignPost(postId: string, assigneeId: string | null) {
  await prisma.post.update({ where: { id: postId }, data: { assigneeId } })
}

/**
 * Приоритет команды (FR-536).
 *
 * Отдельное поле от severity репортера: их слияние ломает и триаж,
 * и отчётность — «насколько мешает мне» и «когда мы это возьмём» отвечают
 * на разные вопросы и меняются независимо.
 */
export async function setPriority(postId: string, priority: string | null) {
  await prisma.post.update({ where: { id: postId }, data: { priority } })
}

/* ───────────────────────────── Merge ──────────────────────────────── */

export type MergeOutcome =
  | { ok: true; movedVotes: number; movedComments: number }
  | {
      ok: false
      reason: 'same-post' | 'source-merged' | 'not-found'
    }

/**
 * Объединение обращений.
 *
 * Самая опасная операция продукта, поэтому по шагам из 02-data-model.md:
 *
 *   1. голоса переносятся С ДЕДУПЛИКАЦИЕЙ — без неё человек, голосовавший
 *      за оба обращения, получает два голоса в одном;
 *   2. подписки — тем же способом, сохраняя отписку: кто отписался,
 *      не должен снова начать получать письма из-за чужого merge;
 *   3. комментарии переезжают — тред не должен рваться;
 *   4. источник становится указателем и отдаёт переход на цель;
 *   5. счётчики пересчитываются из фактов, а НЕ инкрементом: инкремент
 *      разъезжается с реальностью ровно на дубликаты, которые мы отсеяли;
 *   6. журнал слияния — то, что делает возможным откат.
 *
 * Всё это одной транзакцией: половина merge хуже, чем его отсутствие.
 */
export async function mergePosts(
  sourceId: string,
  targetId: string,
  actorId: string,
): Promise<MergeOutcome> {
  if (sourceId === targetId) return { ok: false, reason: 'same-post' }

  const [source, target] = await Promise.all([
    prisma.post.findUnique({
      where: { id: sourceId },
      select: { id: true, mergedIntoId: true, statusId: true },
    }),
    prisma.post.findUnique({
      where: { id: targetId },
      select: { id: true, mergedIntoId: true },
    }),
  ])
  if (!source || !target) return { ok: false, reason: 'not-found' }
  if (source.mergedIntoId) return { ok: false, reason: 'source-merged' }

  /* Цепочки указателей запрещены: если цель уже смержена, берём её
     конечную цель. Иначе переход по ссылке пришлось бы разматывать
     на каждом чтении, и однажды он зациклится. */
  const finalTargetId = await resolveFinalTarget(target.id)
  if (finalTargetId === sourceId) return { ok: false, reason: 'same-post' }

  const duplicateStatus = await prisma.status.findUnique({
    where: { key: 'duplicate' },
    select: { id: true },
  })

  return prisma.$transaction(async (tx) => {
    /* 1. Голоса. `on conflict do nothing` — и есть дедупликация;
          выполнять её кодом значит гонку с параллельным голосованием. */
    const movedVoteUsers = await tx.$queryRaw<{ user_id: string }[]>`
      INSERT INTO "vote" ("post_id", "user_id", "created_at")
      SELECT ${finalTargetId}::uuid, v."user_id", v."created_at"
      FROM "vote" v
      WHERE v."post_id" = ${sourceId}::uuid
      ON CONFLICT ("post_id", "user_id") DO NOTHING
      RETURNING "user_id"
    `

    /* 2. Подписки. Отписка сохраняется: unsubscribed_at не затирается. */
    await tx.$executeRaw`
      INSERT INTO "subscription" ("post_id", "user_id", "source", "unsubscribed_at", "created_at")
      SELECT ${finalTargetId}::uuid, s."user_id", s."source", s."unsubscribed_at", s."created_at"
      FROM "subscription" s
      WHERE s."post_id" = ${sourceId}::uuid
      ON CONFLICT ("post_id", "user_id") DO NOTHING
    `

    /* 3. Комментарии переезжают целиком, вместе с ответами. */
    const movedComments = await tx.comment.updateMany({
      where: { postId: sourceId },
      data: { postId: finalTargetId },
    })

    /* 4. Источник — указатель. Он нигде не показывается, но его адрес
          продолжает работать: ссылки из писем и выдачи не должны умирать. */
    await tx.post.update({
      where: { id: sourceId },
      data: {
        mergedIntoId: finalTargetId,
        moderation: 'approved',
        resolution: 'duplicate',
        resolvedById: actorId,
        resolvedAt: new Date(),
        ...(duplicateStatus ? { statusId: duplicateStatus.id } : {}),
      },
    })

    /* 5. Счётчики — из фактов. */
    await tx.$executeRaw`
      UPDATE "post" SET
        "vote_count" = (SELECT count(*) FROM "vote" WHERE "post_id" = ${finalTargetId}::uuid),
        "comment_count" = (
          SELECT count(*) FROM "comment"
          WHERE "post_id" = ${finalTargetId}::uuid
            AND "deleted_at" IS NULL AND NOT "internal"
        )
      WHERE "id" = ${finalTargetId}::uuid
    `

    /* 6. Журнал: без списка переехавших голосов откат вернёт чужие. */
    await tx.mergeLog.create({
      data: {
        sourceId,
        targetId: finalTargetId,
        mergedById: actorId,
        movedVoteUserIds: movedVoteUsers.map((r) => r.user_id),
      },
    })

    return {
      ok: true as const,
      movedVotes: movedVoteUsers.length,
      movedComments: movedComments.count,
    }
  })
}

/** Разматывает цепочку указателей до живого обращения. */
async function resolveFinalTarget(id: string): Promise<string> {
  let current = id
  for (let hop = 0; hop < 10; hop++) {
    const row = await prisma.post.findUnique({
      where: { id: current },
      select: { mergedIntoId: true },
    })
    if (!row?.mergedIntoId) return current
    current = row.mergedIntoId
  }
  /* Десять переходов — уже не цепочка, а петля в данных. */
  throw new Error(`Циклическая цепочка объединений на обращении ${id}`)
}
