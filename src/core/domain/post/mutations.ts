/**
 * Мутации над обращениями.
 *
 * Домен, а не слой представления: сюда приходят server actions, сюда же
 * придут API и импорт. Правила живут здесь один раз, потому что «писать
 * голоса будут четыре разных места» — не гипотеза, а то, что уже описано
 * в модели данных.
 */

import { defaultStatus } from '@config/statuses'
import { postTypeByKey } from '@config/post-types'
import { prisma } from '@/core/db'
import { slaDueAt } from '@/core/domain/triage/sla'
import { slugify } from '@/core/slug'

/* ──────────────────────────── Голос ───────────────────────────────── */

export interface VoteResult {
  voted: boolean
  count: number
}

/**
 * Поставить или снять голос (FR-132).
 *
 * Гарантия «один человек — один голос» лежит на уникальном индексе
 * `(post_id, user_id)`, а не на проверке в коде: два параллельных клика
 * читают «голоса нет» оба и оба пытаются вставить. Индекс отклонит второй,
 * и мы это молча принимаем — результат ровно тот, которого хотел человек.
 *
 * `vote_count` не трогаем: его ведёт триггер. Возвращаем значение, прочитанное
 * после операции, — оно уже посчитано базой.
 */
export async function toggleVote(postId: string, userId: string): Promise<VoteResult> {
  const existing = await prisma.vote.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  })

  if (existing) {
    await prisma.vote.delete({ where: { id: existing.id } })
  } else {
    try {
      await prisma.vote.create({ data: { postId, userId } })
    } catch (error) {
      /* P2002 — сработал уникальный индекс: голос уже поставлен параллельным
         запросом. Это не ошибка для пользователя: он хотел проголосовать,
         и его голос учтён. */
      if (!isUniqueViolation(error)) throw error
    }
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { voteCount: true },
  })

  return { voted: !existing, count: post?.voteCount ?? 0 }
}

/* ─────────────────────────── Подписка ─────────────────────────────── */

/**
 * Следить за обновлениями обращения (FR-142).
 *
 * Отписка не удаляет строку, а проставляет `unsubscribed_at`: иначе
 * следующий голос за то же обращение подпишет заново, и человек, который
 * однажды отписался, будет получать письма снова.
 */
export async function toggleSubscription(
  postId: string,
  userId: string,
): Promise<boolean> {
  const existing = await prisma.subscription.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true, unsubscribedAt: true },
  })

  if (!existing) {
    await prisma.subscription.create({ data: { postId, userId, source: 'manual' } })
    return true
  }

  const subscribed = existing.unsubscribedAt !== null
  await prisma.subscription.update({
    where: { id: existing.id },
    data: { unsubscribedAt: subscribed ? null : new Date() },
  })
  return subscribed
}

/* ────────────────────────── Комментарий ───────────────────────────── */

export interface CommentInput {
  postId: string
  authorId: string
  body: string
  /** Ответ на комментарий. Вложенность одноуровневая (FR-136). */
  parentId?: string | undefined
  /** Внутренняя заметка команды: публично не отдаётся (FR-139). */
  internal?: boolean
}

export async function addComment(input: CommentInput): Promise<{ id: string }> {
  const body = input.body.trim()
  if (body.length < 2) throw new Error('Комментарий пустой')

  /* Ответ на ответ схлопывается к его родителю: тред с неограниченной
     вложенностью нечитаем, и это решение уровня данных, а не вёрстки. */
  let parentId = input.parentId ?? null
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    })
    parentId = parent?.parentId ?? parentId
  }

  const comment = await prisma.comment.create({
    data: {
      postId: input.postId,
      authorId: input.authorId,
      body,
      parentId,
      internal: input.internal ?? false,
    },
    select: { id: true },
  })

  /* Комментатор начинает следить за обращением: он задал вопрос и ждёт
     ответа. Если он раньше отписывался — не подписываем заново. */
  await prisma.subscription
    .create({ data: { postId: input.postId, userId: input.authorId, source: 'comment' } })
    .catch((error) => {
      if (!isUniqueViolation(error)) throw error
    })

  /* Ответ команды останавливает таймер SLA (FR-538). Только первый:
     first_response_at — момент, когда обращение перестало ждать. */
  const author = await prisma.appUser.findUnique({
    where: { id: input.authorId },
    select: { isTeam: true },
  })
  if (author?.isTeam) {
    await prisma.post.updateMany({
      where: { id: input.postId, firstResponseAt: null },
      data: { firstResponseAt: new Date() },
    })
  } else {
    await reopenIfAutoClosed(input.postId, input.authorId)
  }

  return comment
}

/**
 * Возвращает в работу обращение, закрытое по молчанию (FR-533).
 *
 * Письмо об авто-закрытии обещает: ответите — вернёмся. Если ответ ничего
 * не меняет, обещание оказывается вежливой формой отказа, и человек это
 * запоминает. Поэтому комментарий автора снимает авто-закрытие.
 *
 * Только автора и только авто-закрытие: решение, принятое человеком,
 * комментарием не отменяется — для этого есть очередь триажа.
 */
async function reopenIfAutoClosed(postId: string, commenterId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, resolution: true, statusId: true },
  })
  if (!post || post.resolution !== 'auto_closed' || post.authorId !== commenterId) return

  const reopened = await prisma.status.findUnique({
    where: { key: defaultStatus.key },
    select: { id: true },
  })
  if (!reopened) return

  const note = 'Автор ответил — обращение вернулось в работу.'
  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        statusId: reopened.id,
        statusChangedAt: new Date(),
        resolution: null,
        resolvedAt: null,
        resolvedById: null,
        /* Ход снова у команды: таймер первого ответа начинается заново. */
        firstResponseAt: null,
      },
    }),
    prisma.statusChange.create({
      data: {
        postId,
        fromStatusId: post.statusId,
        toStatusId: reopened.id,
        changedById: commenterId,
        note,
      },
    }),
  ])
}

/* ───────────────────────────── Модерация ──────────────────────────── */

export type ModerationOutcome =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'already-decided' | 'reason-required' }

/**
 * Одобрить обращение (FR-201).
 *
 * После этого оно появляется в ленте и начинает жить обычной жизнью.
 * Автор при этом уже видел его у себя в профиле с пометкой «на проверке» —
 * одобрение не создаёт обращение, а снимает с него занавес.
 */
export async function approvePost(postId: string, actorId: string): Promise<ModerationOutcome> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { moderation: true, authorId: true },
  })
  if (!post) return { ok: false, reason: 'not-found' }
  if (post.moderation !== 'pending') return { ok: false, reason: 'already-decided' }

  /* Публикация и отметка автора — одной транзакцией: одобренное обращение
     от всё ещё «непроверенного» автора означает, что следующее его обращение
     снова уйдёт в очередь, хотя решение уже принято. */
  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        moderation: 'approved',
        moderatedById: actorId,
        moderatedAt: new Date(),
      },
    }),
    /* Автор, прошедший модерацию, дальше публикуется сразу: держать
       проверенного человека в очереди — способ его потерять. */
    ...(post.authorId
      ? [prisma.appUser.update({ where: { id: post.authorId }, data: { trusted: true } })]
      : []),
  ])

  return { ok: true }
}

/**
 * Отклонить обращение.
 *
 * Причина обязательна и уходит автору: человек, чьё обращение отклонили
 * молча, считает, что портал сломан, и пишет ещё раз — теперь уже
 * в поддержку (FR-535).
 */
export async function rejectPost(
  postId: string,
  actorId: string,
  reason: string,
): Promise<ModerationOutcome> {
  const text = reason.trim()
  if (text.length < 3) return { ok: false, reason: 'reason-required' }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { moderation: true },
  })
  if (!post) return { ok: false, reason: 'not-found' }
  if (post.moderation !== 'pending') return { ok: false, reason: 'already-decided' }

  await prisma.post.update({
    where: { id: postId },
    data: {
      moderation: 'rejected',
      moderatedById: actorId,
      moderatedAt: new Date(),
      resolutionReasonPublic: text,
    },
  })

  return { ok: true }
}

/* ──────────────────────── Создание обращения ──────────────────────── */

export interface CreatePostInput {
  boardSlug: string
  typeKey: string
  authorId: string
  title: string
  details: string
  categorySlug?: string | undefined
  severity?: string | undefined
  frequency?: string | undefined
  startedAt?: string | undefined
  environment?: unknown
  /** Канал приёма (FR-557). */
  sourceKey?: string
  /** Обращения от новых аккаунтов уходят в модерацию (FR-201). */
  moderated?: boolean
}

export interface CreatedPost {
  id: string
  ref: string
  slug: string
  boardSlug: string
  moderated: boolean
}

export async function createPost(input: CreatePostInput): Promise<CreatedPost> {
  const type = postTypeByKey.get(input.typeKey)
  if (!type) throw new Error(`Неизвестный тип обращения: ${input.typeKey}`)

  const board = await prisma.board.findUnique({
    where: { slug: input.boardSlug },
    select: { id: true },
  })
  if (!board) throw new Error(`Неизвестная доска: ${input.boardSlug}`)

  const [typeRow, statusRow, sourceRow, category] = await Promise.all([
    prisma.postType.findUnique({ where: { key: input.typeKey }, select: { id: true } }),
    prisma.status.findUnique({
      where: { key: type.defaultStatusKey || defaultStatus.key },
      select: { id: true },
    }),
    prisma.intakeSource.findUnique({
      where: { key: input.sourceKey ?? 'portal' },
      select: { id: true },
    }),
    input.categorySlug
      ? prisma.category.findFirst({
          where: { boardId: board.id, slug: input.categorySlug },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])
  if (!typeRow || !statusRow) throw new Error('Справочники не заполнены: pnpm db:seed')

  const createdAt = new Date()
  const severity = input.severity ?? null

  const post = await prisma.post.create({
    data: {
      boardId: board.id,
      typeId: typeRow.id,
      statusId: statusRow.id,
      sourceId: sourceRow?.id ?? null,
      categoryId: category?.id ?? null,
      authorId: input.authorId,
      title: input.title.trim(),
      slug: await uniqueSlug(board.id, input.title),
      ref: await nextRef(),
      details: input.details.trim(),
      privacy: type.defaultPrivacy,
      moderation: input.moderated ? 'pending' : 'approved',
      severity,
      frequency: (input.frequency ?? null) as never,
      startedAt: input.startedAt ?? null,
      environment: (input.environment ?? null) as never,
      /* Срок первого ответа считается при приёме — из политики, а не руками
         (FR-538). Для типов без политики остаётся null: обещать ответ
         на каждую идею за N часов невыполнимо. */
      slaDueAt: slaDueAt(createdAt, input.typeKey, severity),
      statusChangedAt: createdAt,
      createdAt,
    },
    select: { id: true, ref: true, slug: true },
  })

  /* Автор подписан на своё обращение: иначе ответ команды до него не дойдёт. */
  await prisma.subscription.create({
    data: { postId: post.id, userId: input.authorId, source: 'author' },
  })

  /* Первый статус — строкой истории, а не выводом из текущего значения:
     страница обращения показывает путь, а не только точку. */
  await prisma.statusChange.create({
    data: { postId: post.id, toStatusId: statusRow.id, createdAt },
  })

  return {
    id: post.id,
    ref: post.ref,
    slug: post.slug,
    boardSlug: input.boardSlug,
    moderated: input.moderated ?? false,
  }
}

/**
 * Slug уникален в паре с доской и не меняется при переименовании (FR-182).
 * Столкновения разводятся суффиксом: два обращения с одинаковым заголовком —
 * обычное дело, а вот сломанная ссылка — нет.
 */
async function uniqueSlug(boardId: string, title: string): Promise<string> {
  const base = slugify(title)
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const taken = await prisma.post.findFirst({
      where: { boardId, slug },
      select: { id: true },
    })
    if (!taken) return slug
  }
  /* Полсотни однофамильцев — уже не совпадение, а импорт: разводим временем. */
  return `${base}-${Date.now().toString(36)}`
}

/**
 * Следующий человекочитаемый номер.
 *
 * Считается от максимального существующего, а не от количества строк:
 * количество уменьшается при удалении, и номера начали бы повторяться.
 */
async function nextRef(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT max(substring("ref" from '[0-9]+$')::int) AS max FROM "post"
  `
  return `RTM-${(row?.max ?? 4000) + 1}`
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}
