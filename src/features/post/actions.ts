'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  addComment,
  toggleSubscription,
  toggleVote,
  type VoteResult,
} from '@/core/domain/post/mutations'
import { canContribute, getViewer } from '@/core/session'

/**
 * Действия на странице обращения и в ленте.
 *
 * Право на действие проверяется здесь, а не в компоненте: кнопка, скрытая
 * в разметке, не мешает отправить тот же запрос напрямую.
 */

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'unauthorized' | 'banned' | 'invalid' }

type Access =
  | { ok: true; viewer: Awaited<ReturnType<typeof getViewer>> }
  | { ok: false; reason: 'unauthorized' | 'banned' }

async function contributor(): Promise<Access> {
  const viewer = await getViewer()
  if (!viewer.signedIn) return { ok: false, reason: 'unauthorized' }
  if (viewer.banned) return { ok: false, reason: 'banned' }
  if (!canContribute(viewer)) return { ok: false, reason: 'unauthorized' }
  return { ok: true, viewer }
}

export async function voteAction(postId: string): Promise<ActionResult<VoteResult>> {
  const access = await contributor()
  if (!access.ok) return access

  const result = await toggleVote(postId, access.viewer.id)
  return { ok: true, ...result }
}

export async function subscriptionAction(
  postId: string,
): Promise<ActionResult<{ subscribed: boolean }>> {
  const access = await contributor()
  if (!access.ok) return access

  const subscribed = await toggleSubscription(postId, access.viewer.id)
  return { ok: true, subscribed }
}

export async function commentAction(
  postId: string,
  boardSlug: string,
  slug: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const access = await contributor()
  if (!access.ok) return access

  const body = String(formData.get('body') ?? '').trim()
  const parentId = String(formData.get('parentId') ?? '') || undefined
  if (body.length < 2) return { ok: false, reason: 'invalid' }

  const comment = await addComment({
    postId,
    authorId: access.viewer.id,
    body,
    parentId,
    /* Внутренние заметки пишет только команда, и это не то же самое,
       что публичный ответ (FR-139). */
    internal: access.viewer.isTeam && formData.get('internal') === 'on',
  })

  /* Тред рендерится на сервере — страницу нужно перечитать. Голоса
     и подписка так не делают: они обновляются на месте. */
  revalidatePath(`/${boardSlug}/p/${slug}`)
  return { ok: true, id: comment.id }
}

/**
 * То же самое для обычной формы на странице обращения.
 *
 * Отдельная обёртка, потому что `<form action>` обязан возвращать void:
 * форма без JavaScript должна работать так же, как с ним, а значит её
 * результат — новая версия страницы, а не объект.
 */
export async function submitCommentForm(
  postId: string,
  boardSlug: string,
  slug: string,
  formData: FormData,
): Promise<void> {
  const result = await commentAction(postId, boardSlug, slug, formData)
  if (!result.ok && result.reason === 'unauthorized') redirect('/login')
}
