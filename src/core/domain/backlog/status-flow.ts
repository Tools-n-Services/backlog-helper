/**
 * Перенос внутреннего состояния работы на публичные статусы обращений
 * (FR-632, FR-634, FR-635, FR-636).
 *
 * Это то, ради чего продукт существует: человек проголосовал и должен узнать
 * судьбу своего запроса, ничего для этого не делая. Правило одностороннее,
 * и односторонность здесь не стилистика (02-data-model.md, «Маппинг статусов»):
 *
 *   внутренний статус ──config──► публичный статус связанных обращений ──► письма
 *                                          ▲
 *                                    ручная смена админом
 *
 * Обратной автоматики нет вовсе (FR-633). Двусторонняя синхронизация даёт
 * петлю: публичный статус меняет внутренний, тот снова публичный — и каждый
 * оборот ставит письмо в очередь.
 *
 * Три вещи, которые здесь важнее остального:
 *
 * 1. **Не у каждого этапа есть публичное соответствие.** `discovery`, `review`
 *    и `inbox` не двигают ничего и не рассылают: иначе на активной задаче
 *    человек получит пять писем за неделю и отпишется навсегда (FR-634).
 * 2. **Обращение, уже стоящее в целевом статусе, не переводится заново.**
 *    Иначе повторное сохранение карточки — а его делают часто, правя соседнее
 *    поле — рассылает второе письмо об одном и том же событии.
 * 3. **Письма ставятся в очередь строкой `status_change`, а не отправляются
 *    здесь.** Падение почты не должно откатывать смену статуса (FR-309).
 */

import { catalog, loadCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'

export interface PublicEffect {
  /** Публичный статус, в который ушли обращения. null — переход внутренний. */
  statusKey: string | null
  /** Сколько обращений действительно сменили статус. */
  posts: number
}

const NOTHING_PUBLIC: PublicEffect = { statusKey: null, posts: 0 }

export interface ApplyInternalStatusInput {
  itemId: string
  /** Ключ внутреннего этапа, в который перешла работа. */
  internalStatusKey: string | null
  actorId: string | null
  /** Публичная формулировка решения: она и уходит в письмо (FR-636). */
  note?: string | null
}

/**
 * Переводит связанные обращения в публичный статус этапа.
 *
 * Обращения берутся только у самого элемента, без дочерних фаз: у фазы свои
 * связи, и её выпуск закрывает своё, а не всё, во что разбита крупная работа.
 */
export async function applyInternalStatus(
  input: ApplyInternalStatusInput,
): Promise<PublicEffect> {
  if (!input.internalStatusKey) return NOTHING_PUBLIC

  await loadCatalog()
  const stage = catalog().internalStatusByKey.get(input.internalStatusKey)
  if (!stage?.publicStatusKey) return NOTHING_PUBLIC

  const target = await prisma.status.findUnique({
    where: { key: stage.publicStatusKey },
    select: { id: true, key: true, isTerminal: true },
  })
  /* Этап ссылается на статус, которого нет: справочник правили в обход
     маппинга.
     Молчать здесь нельзя: работа выглядит выпущенной, а обращения стоят
     в прежнем статусе, и узнают об этом от пользователей. */
  if (!target) {
    throw new Error(
      `Публичный статус «${stage.publicStatusKey}» не найден в базе: ` +
        'набор статусов правили в конфиге и не пересеяли.',
    )
  }

  const links = await prisma.backlogPost.findMany({
    where: { backlogItemId: input.itemId },
    select: {
      post: {
        select: { id: true, statusId: true, firstResponseAt: true, mergedIntoId: true },
      },
    },
  })

  const note = input.note?.trim() || null
  const now = new Date()
  let moved = 0

  for (const { post } of links) {
    /* Смерженное обращение — указатель на цель. Его статус нигде не
       показывается, а подписки и голоса давно переехали: перевод такого
       обращения означал бы письмо о статусе страницы, которую человек
       уже не видит. */
    if (post.mergedIntoId) continue
    if (post.statusId === target.id) continue

    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          statusId: target.id,
          statusChangedAt: now,
          ...(target.isTerminal && stage.publicResolution
            ? {
                resolution: stage.publicResolution,
                resolutionReasonPublic: note,
                resolvedById: input.actorId,
                resolvedAt: now,
              }
            : {}),
          /* Работа поехала — обращение больше не ждёт автора: иначе оно
             закроется по молчанию, уже будучи в плане (FR-533). */
          needsInfoSince: null,
          /* Планирование работы — это и есть ответ команды, даже если его
             не написали словами. Без этого таймер SLA продолжает идти,
             и очередь триажа показывает просроченным то, что уже делают. */
          firstResponseAt: post.firstResponseAt ?? now,
        },
      }),
      prisma.statusChange.create({
        data: {
          postId: post.id,
          fromStatusId: post.statusId,
          toStatusId: target.id,
          changedById: input.actorId,
          note,
          createdAt: now,
        },
      }),
    ])
    moved++
  }

  return { statusKey: target.key, posts: moved }
}
