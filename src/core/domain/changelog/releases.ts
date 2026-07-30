/**
 * Публикация записи changelog и закрытие обращений, которые она закрыла
 * (FR-165, FR-166, FR-303).
 *
 * Точка, в которой цикл обратной связи замыкается по-настоящему: человек
 * когда-то проголосовал, и теперь ему приходит письмо «то, что вы просили,
 * вышло» — не «статус изменился на Выполнено». Разница не косметическая:
 * первое письмо продукт даёт как обещанное, второе выглядит служебной
 * рассылкой, и открывают его соответственно.
 *
 * Публикация происходит один раз и только один. Это не аккуратность,
 * а требование к рассылке: повторная публикация означала бы второе письмо
 * тем же людям об одном и том же выпуске. Поэтому запись «занимается»
 * условным обновлением `published_at is null` — даже два одновременных
 * нажатия дают одну публикацию.
 */

import { loadSettings, settings } from '@/core/settings'
import { prisma } from '@/core/db'

export type PublishOutcome =
  | { ok: true; posts: number }
  | { ok: false; reason: 'not-found' | 'already-published' | 'status-missing' }

/**
 * Опубликовать запись: закрыть связанные обращения и поставить письма.
 *
 * Письма ставятся в очередь строками `status_change` с отметкой релиза,
 * а не отправляются здесь: падение почты не должно откатывать публикацию
 * (FR-309). Обратное тоже верно — публикация, откатившаяся из-за письма,
 * оставила бы запись в черновиках уже после того, как о релизе объявили.
 */
export async function publishRelease(
  entryId: string,
  actorId: string | null,
): Promise<PublishOutcome> {
  /* Публикацию запускает и человек из админки, и проход воркера по сроку:
     статус «выпущено» приходит из настроек, и грузить их обязан тот, кто
     публикует. */
  await loadSettings()
  const entry = await prisma.changelogEntry.findUnique({
    where: { id: entryId },
    select: { id: true, title: true, version: true, publishedAt: true },
  })
  if (!entry) return { ok: false, reason: 'not-found' }
  if (entry.publishedAt) return { ok: false, reason: 'already-published' }

  const released = await prisma.status.findUnique({
    where: { key: settings().releasedStatusKey },
    select: { id: true, isTerminal: true },
  })
  /* Публиковать запись, не сумев закрыть обращения, нельзя: письма о выпуске
     уйдут, а обращения останутся открытыми — и следующее письмо человек
     получит уже о «смене статуса» того же самого. */
  if (!released) return { ok: false, reason: 'status-missing' }

  const links = await prisma.changelogPost.findMany({
    where: { entryId: entry.id },
    select: {
      post: {
        select: { id: true, statusId: true, firstResponseAt: true, mergedIntoId: true },
      },
    },
  })

  const note = entry.version
    ? `Вышло в релизе ${entry.version} — ${entry.title}`
    : `Вышло: ${entry.title}`
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    /* Условие `published_at is null` — и есть защита от второй рассылки.
       Проверять кодом значит оставить окно между чтением и записью. */
    const claimed = await tx.changelogEntry.updateMany({
      where: { id: entry.id, publishedAt: null },
      data: { publishedAt: now },
    })
    if (claimed.count === 0) return { ok: false as const, reason: 'already-published' as const }

    let closed = 0
    for (const { post } of links) {
      /* Смерженное обращение — указатель на цель: его подписчики давно
         переехали, и письмо о странице, которую они не видят, лишнее. */
      if (post.mergedIntoId) continue
      /* Уже закрытое этим же статусом не закрывается второй раз: обращение
         могли перевести решением триажа до релиза, и второе письмо об этом
         человеку ничего не сообщает. */
      if (post.statusId === released.id) continue

      await tx.post.update({
        where: { id: post.id },
        data: {
          statusId: released.id,
          statusChangedAt: now,
          resolution: 'fixed',
          resolutionReasonPublic: note,
          resolvedById: actorId,
          resolvedAt: now,
          needsInfoSince: null,
          firstResponseAt: post.firstResponseAt ?? now,
        },
      })
      await tx.statusChange.create({
        data: {
          postId: post.id,
          fromStatusId: post.statusId,
          toStatusId: released.id,
          changedById: actorId,
          note,
          /* Отметка, из-за которой рассылка выберет письмо о выпуске,
             а не о смене статуса (FR-303). */
          releaseEntryId: entry.id,
          createdAt: now,
        },
      })
      closed++
    }

    return { ok: true as const, posts: closed }
  })
}

export interface ScheduledResult {
  published: number
  posts: number
}

/**
 * Публикация записей, у которых пришёл срок (FR-166).
 *
 * Отложенная публикация нужна не ради удобства: релиз объявляют одновременно
 * в нескольких местах, и запись, вышедшая на портале на два часа раньше
 * рассылки и статьи, ломает всю согласованную дату. Проход воркера — та часть,
 * которая не требует, чтобы в этот момент кто-то был у ноутбука.
 */
export async function publishScheduled(): Promise<ScheduledResult> {
  const due = await prisma.changelogEntry.findMany({
    where: { publishedAt: null, scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    select: { id: true },
  })

  const result: ScheduledResult = { published: 0, posts: 0 }
  for (const entry of due) {
    /* Автор публикации неизвестен — её никто не нажимал. Пустое поле честнее
       подстановки первого администратора: в истории обращения будет видно,
       что статус сменил не человек. */
    const published = await publishRelease(entry.id, null)
    if (!published.ok) continue
    result.published++
    result.posts += published.posts
  }
  return result
}
