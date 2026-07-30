/**
 * Вложения обращений (FR-512, FR-561, FR-562).
 *
 * Для бага вложение — половина ценности: скриншот и лог экономят раунд
 * переписки, в котором обычно и теряется репортер. Поэтому файл загружается
 * сразу при выборе, а не после отправки формы: человек видит, что файл дошёл,
 * пока ещё пишет текст.
 *
 * Три правила, которые здесь важнее остального.
 *
 * 1. **Белый список типов.** Отвергается всё, чего нет в `config/attachments.ts`,
 *    включая то, о чём мы не слышали. Чёрный список исполняемых обречён.
 * 2. **Вложение бага по умолчанию `team_only`.** На скриншоте чужие имена,
 *    адреса и номера заказов — их видит команда, а не лента (FR-561).
 * 3. **Файл не живёт вечно.** Незавершённая загрузка убирается через сутки,
 *    вложения закрытого обращения — через срок из конфига (FR-562). Иначе
 *    портал становится бессрочным хранилищем персональных данных, которое
 *    никто не собирался заводить.
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'

import {
  attachmentRules,
  maxAttachmentsPerPost,
  retentionDaysAfterClose,
  stagingHours,
  type AttachmentKindKey,
} from '@config/attachments'
import { postTypeByKey } from '@config/post-types'
import { prisma } from '@/core/db'
import { sizeLabel } from '@/core/format'
import { deleteObject, putObject } from '@/core/storage'

export interface UploadedFile {
  name: string
  mime: string
  bytes: Buffer
}

export type UploadOutcome =
  | { ok: true; id: string; name: string; kind: AttachmentKindKey; sizeBytes: number }
  | { ok: false; reason: 'type' | 'size' | 'empty' | 'storage'; message: string }

/**
 * Тип файла по MIME и расширению.
 *
 * Расширение уточняет, а не заменяет: HAR приходит обычным `application/json`,
 * и без уточнения он попал бы в «логи» с их лимитом в пять мегабайт.
 */
export function classify(name: string, mime: string): AttachmentKindKey | null {
  const extension = path.extname(name).toLowerCase()
  const clean = mime.split(';')[0]?.trim().toLowerCase() ?? ''

  const byExtension = attachmentRules.find(
    (rule) => rule.extensions?.includes(extension) && rule.mimes.includes(clean),
  )
  if (byExtension) return byExtension.kind

  return attachmentRules.find((rule) => rule.mimes.includes(clean))?.kind ?? null
}

function ruleFor(kind: AttachmentKindKey) {
  return attachmentRules.find((rule) => rule.kind === kind) ?? null
}

/**
 * Принять файл: проверить, положить в хранилище, завести строку.
 *
 * Строка заводится без обращения — его ещё нет. Такое вложение живёт сутки
 * и убирается retention, если форму так и не отправили.
 */
export async function uploadAttachment(
  file: UploadedFile,
  uploaderId: string,
): Promise<UploadOutcome> {
  if (file.bytes.length === 0) {
    return { ok: false, reason: 'empty', message: 'Файл пустой.' }
  }

  const kind = classify(file.name, file.mime)
  if (!kind) {
    return {
      ok: false,
      reason: 'type',
      message: `Такие файлы не принимаем: ${file.mime || 'тип не определён'}.`,
    }
  }

  const rule = ruleFor(kind)
  if (rule && file.bytes.length > rule.maxBytes) {
    return {
      ok: false,
      reason: 'size',
      message: `${rule.name} — не больше ${sizeLabel(rule.maxBytes)}, а тут ${sizeLabel(file.bytes.length)}.`,
    }
  }

  /* Имя файла в ключ не идёт: в нём бывает и кириллица, и пробелы, и чужие
     персональные данные вроде «договор-иванов.png». Хранилищу нужен ключ,
     а имя показывается из базы. */
  const id = randomUUID()
  const key = `attachments/${id}${path.extname(file.name).toLowerCase()}`

  const stored = await putObject(key, file.bytes, file.mime)
  if (!stored.ok) {
    return { ok: false, reason: 'storage', message: `Не удалось сохранить файл: ${stored.error}` }
  }

  const created = await prisma.attachment.create({
    data: {
      id,
      kind,
      storageKey: key,
      mime: file.mime,
      sizeBytes: BigInt(file.bytes.length),
      fileName: file.name.slice(0, 200),
      uploadedById: uploaderId,
      /* Загруженное, но не отправленное живёт сутки. */
      purgeAt: new Date(Date.now() + stagingHours * 3_600_000),
    },
    select: { id: true },
  })

  return {
    ok: true,
    id: created.id,
    name: file.name,
    kind,
    sizeBytes: file.bytes.length,
  }
}

/**
 * Привязать загруженное к созданному обращению.
 *
 * Привязать может только тот, кто загружал: идентификатор строки хоть и
 * не угадывается, но «не угадывается» — это не право доступа. Видимость
 * берётся из приватности типа обращения (FR-561): у бага она `team_only`,
 * и решать это должен конфиг продукта, а не форма.
 */
export async function bindAttachments(
  postId: string,
  ids: string[],
  uploaderId: string,
): Promise<number> {
  if (ids.length === 0) return 0

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { type: { select: { key: true } } },
  })
  if (!post) return 0

  const privacy = postTypeByKey.get(post.type.key)?.defaultPrivacy ?? 'public'
  const visibility = privacy === 'public' ? 'public' : 'team_only'

  const bound = await prisma.attachment.updateMany({
    where: {
      id: { in: ids.slice(0, maxAttachmentsPerPost) },
      postId: null,
      uploadedById: uploaderId,
    },
    data: {
      postId,
      visibility,
      /* Срок жизни считается от закрытия обращения, а не от загрузки:
         пока обращение живо, вложение нужно. Проставит его retention. */
      purgeAt: null,
    },
  })

  return bound.count
}

/** Убрать файл, который человек передумал прикладывать. */
export async function discardAttachment(id: string, uploaderId: string): Promise<void> {
  const attachment = await prisma.attachment.findFirst({
    where: { id, postId: null, uploadedById: uploaderId },
    select: { id: true, storageKey: true },
  })
  if (!attachment) return

  await deleteObject(attachment.storageKey)
  await prisma.attachment.delete({ where: { id: attachment.id } })
}

export interface RetentionResult {
  /** Сколько вложений получили срок жизни после закрытия обращения. */
  scheduled: number
  /** Сколько удалено вместе с файлом. */
  purged: number
  /** Файлы, которые хранилище не отдало удалить: строка осталась до следующего прохода. */
  failed: number
}

/**
 * Retention вложений (FR-562).
 *
 * Проход, а не хук на закрытии обращения: обращение закрывается из четырёх
 * разных мест — решением триажа, авто-закрытием, этапом работы и публикацией
 * релиза, — и хук пришлось бы повторить в каждом. Забыть в одном из четырёх
 * означало бы, что часть вложений живёт вечно, и заметить это нельзя.
 *
 * Строка удаляется только после файла: обратный порядок теряет объект
 * в хранилище навсегда — ссылки на него больше нет нигде.
 */
export async function purgeAttachments(): Promise<RetentionResult> {
  const now = new Date()

  /* 1. Закрытым обращениям — срок. `resolved_at` ставится вместе с решением,
        и от него считается retention. */
  const scheduled = await prisma.$executeRawUnsafe(
    `
    UPDATE "attachment" a
    SET "purge_at" = p."resolved_at" + ($1 || ' days')::interval
    FROM "post" p
    WHERE p."id" = a."post_id"
      AND p."resolved_at" IS NOT NULL
      AND a."purge_at" IS NULL
  `,
    String(retentionDaysAfterClose),
  )

  /* 2. Всё, чей срок вышел: и брошенные загрузки, и вложения закрытых. */
  const due = await prisma.attachment.findMany({
    where: { purgeAt: { lte: now } },
    select: { id: true, storageKey: true },
    take: 200,
  })

  let purged = 0
  let failed = 0
  for (const attachment of due) {
    const removed = await deleteObject(attachment.storageKey)
    if (!removed.ok) {
      failed++
      continue
    }
    await prisma.attachment.delete({ where: { id: attachment.id } })
    purged++
  }

  return { scheduled, purged, failed }
}

export type AccessDecision = 'allow' | 'forbid' | 'not-found'

export interface AttachmentViewer {
  signedIn: boolean
  id: string
  isStaff: boolean
}

/**
 * Кто может открыть файл.
 *
 * Проверка на каждом запросе, а не подписанная ссылка с истечением: ссылка
 * живёт своей жизнью после выдачи, а право — нет. Пересланная в чат ссылка
 * на `team_only` не должна открываться у того, кому её переслали, — и с
 * проверкой прав она и не откроется.
 */
export async function decideAccess(
  attachmentId: string,
  viewer: AttachmentViewer,
): Promise<{ decision: AccessDecision; storageKey?: string; mime?: string }> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      storageKey: true,
      mime: true,
      visibility: true,
      uploadedById: true,
      post: { select: { authorId: true } },
    },
  })
  if (!attachment) return { decision: 'not-found' }

  const found = { storageKey: attachment.storageKey, mime: attachment.mime }

  if (attachment.visibility === 'public') return { decision: 'allow', ...found }
  if (viewer.isStaff) return { decision: 'allow', ...found }

  /* Репортер видит своё: он это и прислал. Остальным `team_only` закрыт,
     включая тех, кто просто знает ссылку. */
  const own =
    viewer.signedIn &&
    (attachment.uploadedById === viewer.id || attachment.post?.authorId === viewer.id)

  return own ? { decision: 'allow', ...found } : { decision: 'forbid' }
}
