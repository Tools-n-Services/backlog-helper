'use server'

import { product } from '@config/product'
import { postTypeByKey } from '@config/post-types'
import { prisma } from '@/core/db'
import { checkRateLimit } from '@/core/domain/intake/rate-limit'
import {
  hasErrors,
  validateSubmission,
  type FieldErrors,
  type FormValues,
} from '@/core/domain/intake/validate'
import { createPost } from '@/core/domain/post/mutations'
import { canContribute, getViewer } from '@/core/session'
import { queries } from '@/queries'
import type { SimilarPostView } from '@/queries/types'

/** Поиск похожих на вводе заголовка (FR-122). */
export async function searchSimilar(
  boardSlug: string,
  typeKey: string,
  title: string,
): Promise<SimilarPostView[]> {
  const viewer = await getViewer()
  return queries.findSimilar(
    { boardSlug, typeKey, title },
    viewer.signedIn ? viewer.id : undefined,
  )
}

export type SubmitResult =
  | { ok: true; ref: string; slug: string; boardSlug: string; moderated: boolean }
  | { ok: false; kind: 'validation'; errors: FieldErrors }
  | { ok: false; kind: 'auth'; reason: 'unauthorized' | 'banned' }
  | {
      ok: false
      kind: 'rate-limit'
      window: 'hour' | 'day'
      limit: number
      retryAfterMinutes: number
    }

/**
 * Отправка обращения (FR-120..126).
 *
 * Лимит считается по фактическим обращениям этого автора в базе, а не по
 * отметкам в памяти процесса: память живёт до перезапуска и не общая между
 * инстансами, то есть лимит обходится перезагрузкой страницы в неудачный
 * момент. Само правило (`checkRateLimit`) при этом не поменялось — менялось
 * только то, откуда берутся отметки.
 */
export async function submitPost(
  boardSlug: string,
  typeKey: string,
  values: FormValues,
): Promise<SubmitResult> {
  const viewer = await getViewer()
  if (!viewer.signedIn) return { ok: false, kind: 'auth', reason: 'unauthorized' }
  if (!canContribute(viewer)) return { ok: false, kind: 'auth', reason: 'banned' }

  const type = postTypeByKey.get(typeKey)
  const board = await queries.getBoard(boardSlug)
  if (!type || !board) {
    return { ok: false, kind: 'validation', errors: { title: 'Неизвестная доска или тип' } }
  }

  const errors = validateSubmission(type, values, {
    requireCategory: board.requireCategory,
  })
  if (hasErrors(errors)) return { ok: false, kind: 'validation', errors }

  const dayAgo = new Date(Date.now() - 86_400_000)
  const recent = await prisma.post.findMany({
    where: { authorId: viewer.id, createdAt: { gte: dayAgo } },
    select: { createdAt: true },
  })

  const now = Date.now()
  const verdict = checkRateLimit(
    recent.map((p) => p.createdAt.getTime()),
    now,
    {
      postsPerHour: product.limits.postsPerHour,
      postsPerDay: product.limits.postsPerDay,
    },
  )
  if (!verdict.allowed) {
    return {
      ok: false,
      kind: 'rate-limit',
      window: verdict.window,
      limit: verdict.limit,
      retryAfterMinutes: verdict.retryAfterMinutes,
    }
  }

  /* Обращения от новых аккаунтов уходят в очередь модерации (FR-201).
     «Новый» — тот, кого ещё не отмечали как проверенного; флаг ставится
     при первом одобрении, дальше человек публикуется сразу. Держать
     проверенного автора в очереди — способ его потерять. */
  const author = await prisma.appUser.findUnique({
    where: { id: viewer.id },
    select: { trusted: true },
  })
  const moderated = !author?.trusted

  const created = await createPost({
    boardSlug,
    typeKey,
    authorId: viewer.id,
    title: String(values.title ?? ''),
    details: detailsFrom(typeKey, values),
    categorySlug: asString(values.category),
    severity: asString(values.severity),
    frequency: asString(values.frequency),
    startedAt: asString(values.startedAt),
    environment: values.environment,
    moderated,
  })

  return {
    ok: true,
    ref: created.ref,
    slug: created.slug,
    boardSlug: created.boardSlug,
    moderated,
  }
}

function asString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}

/**
 * Тело обращения из полей формы.
 *
 * У бага полей несколько, и склеивать их в один текст — потеря: «что ожидалось»
 * отдельным абзацем с подписью читается, а слитое в один поток — нет.
 * Подписи берутся из схемы типа, поэтому новый тип обращения не требует
 * правки этого кода (FR-502).
 */
function detailsFrom(typeKey: string, values: FormValues): string {
  const type = postTypeByKey.get(typeKey)
  if (!type) return String(values.details ?? '')

  const parts: string[] = []
  for (const field of type.formSchema) {
    if (field.name === 'title' || field.kind === 'attachments') continue
    if (field.kind === 'environment' || field.kind === 'select') continue
    const value = asString(values[field.name])
    if (!value) continue
    /* Единственное текстовое поле не нуждается в заголовке над собой. */
    parts.push(field.name === 'details' ? value : `**${field.label}**\n${value}`)
  }
  return parts.join('\n\n')
}
