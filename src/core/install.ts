/**
 * Установка портала (В4, docs/09-install.md).
 *
 * Мастер настраивает портал, который уже запущен: справочники и настройки
 * живут в базе (В1, В2), поэтому «установить» здесь означает налить
 * справочники, записать настройки и завести владельца — а не собрать образ.
 *
 * Признак завершения — ключ `installed_at`, **а не наличие владельца**.
 * Разница не теоретическая: владельца можно случайно удалить, и портал
 * с живыми данными снова открыл бы установку постороннему.
 */

import { randomUUID } from 'node:crypto'

import { invalidateCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'
import { invalidateSettings, type Settings } from '@/core/settings'
import { UPLOAD_DIR, putObject, deleteObject, storageProvider } from '@/core/storage'
import { postTypes } from '@config/post-types'
import { product } from '@config/product'
import { statuses } from '@config/statuses'
import { internalStatuses } from '@config/internal-statuses'
import { slaPolicies } from '@config/scoring'

export const INSTALLED_KEY = 'installed_at'

/** Кука с токеном установки: он не должен оставаться в адресной строке. */
export const INSTALL_COOKIE = 'bh_install'

/** Установка завершена: мастер закрыт навсегда. */
export async function isInstalled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: INSTALLED_KEY } })
    return row !== null
  } catch {
    /* Таблицы ещё нет — миграции не применены. Это «не установлено»,
       а не ошибка: мастер должен открыться и сказать, чего не хватает. */
    return false
  }
}

/**
 * Открыт ли мастер этому запросу.
 *
 * Токен обязателен: свежий портал в интернете находят сканеры за минуты,
 * и открытая страница установки — классический способ получить чужой сайт
 * вместе с базой. Токена нет в среде — мастер недоступен вовсе, а не
 * «доступен всем».
 */
export function installToken(): string | null {
  return process.env.INSTALL_TOKEN?.trim() || null
}

/* ───────────────────────────── Проверки среды ───────────────────────────── */

export interface EnvironmentCheck {
  key: string
  title: string
  ok: boolean
  /** Что именно не так и что с этим делать. */
  detail: string
}

/**
 * Что мешает установке прямо сейчас.
 *
 * Проверки называют причину и лечение по отдельности: «не применены
 * миграции» и «нет расширения pg_trgm» — разные проблемы с разными
 * действиями, и «база недоступна» вместо них обоих экономит секунду
 * человеку и стоит ему получаса.
 */
export async function checkEnvironment(): Promise<EnvironmentCheck[]> {
  const checks: EnvironmentCheck[] = []

  let dbOk = false
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = true
    checks.push({
      key: 'db',
      title: 'База данных отвечает',
      ok: true,
      detail: 'Соединение установлено.',
    })
  } catch (error) {
    checks.push({
      key: 'db',
      title: 'База данных отвечает',
      ok: false,
      detail: `Нет соединения: ${message(error)}. Проверьте DATABASE_URL.`,
    })
  }

  if (dbOk) {
    /* Таблица настроек появляется миграцией: её отсутствие означает, что
       контейнер стартовал без шага миграций, а не что база пустая. */
    let migrated = false
    try {
      await prisma.setting.count()
      migrated = true
    } catch {
      migrated = false
    }
    checks.push({
      key: 'migrations',
      title: 'Миграции применены',
      ok: migrated,
      detail: migrated
        ? 'Схема на месте.'
        : 'Схема не найдена. Выполните pnpm db:migrate (в образе это шаг до старта).',
    })

    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension
    `
    const names = new Set(extensions.map((e) => e.extname))
    const missing = ['pg_trgm', 'unaccent'].filter((n) => !names.has(n))
    checks.push({
      key: 'extensions',
      title: 'Расширения поиска установлены',
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? 'pg_trgm и unaccent на месте.'
          : `Не хватает: ${missing.join(', ')}. Без них поиск не находит по опечаткам.`,
    })

    const rows = await prisma.$queryRaw<{ TimeZone?: string; timezone?: string }[]>`SHOW timezone`
    const tz = rows[0]?.TimeZone ?? rows[0]?.timezone ?? 'неизвестен'
    checks.push({
      key: 'timezone',
      title: 'Часовой пояс соединения — UTC',
      ok: tz === 'UTC',
      /* Расхождение пояса даёт сдвиг во всём, что сравнивает время внутри
         SQL, и заметить это можно только пересчётом. */
      detail:
        tz === 'UTC' ? 'UTC.' : `Сейчас ${tz}: даты в отчётах разъедутся с датами в коде.`,
    })
  }

  checks.push(await checkStorage())
  return checks
}

async function checkStorage(): Promise<EnvironmentCheck> {
  const key = `install-check/${randomUUID()}`
  try {
    await putObject(key, Buffer.from('ok', 'utf8'), 'text/plain')
    await deleteObject(key)
    return {
      key: 'storage',
      title: 'Хранилище вложений доступно на запись',
      ok: true,
      detail:
        storageProvider() === 'file'
          ? `Каталог ${UPLOAD_DIR}. Для нескольких инстансов понадобится S3.`
          : 'Бакет отвечает на запись и удаление.',
    }
  } catch (error) {
    return {
      key: 'storage',
      title: 'Хранилище вложений доступно на запись',
      ok: false,
      detail: `Запись не удалась: ${message(error)}`,
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* ─────────────────────────────── Пресеты ────────────────────────────────── */

export interface Preset {
  key: string
  name: string
  hint: string
  boardSlugs: string[]
  typeKeys: string[]
}

/**
 * Готовые наборы, из которых наливается свежая установка.
 *
 * Это и есть ответ на «максимально просто»: человеку, которому всё равно,
 * достаточно нажать «дальше». Пресет — выборка из `config/*.ts`, а не второй
 * набор данных: иначе наборы разошлись бы при первой же правке конфига.
 */
export const presets: Preset[] = [
  {
    key: 'product',
    name: 'Продуктовый портал',
    hint: 'Идеи, ошибки и вопросы. Всё, что умеет портал.',
    boardSlugs: product.boards.map((b) => b.slug),
    typeKeys: postTypes.map((t) => t.key),
  },
  {
    key: 'bugs',
    name: 'Только ошибки',
    hint: 'Приём багов и вопросов. Досок две, идеи не собираются.',
    boardSlugs: ['bugs', 'product'],
    typeKeys: ['bug', 'question'],
  },
  {
    key: 'minimal',
    name: 'Минимальный',
    hint: 'Одна доска и один тип обращения. Остальное добавите в админке.',
    boardSlugs: ['product'],
    typeKeys: ['idea'],
  },
]

export const presetByKey = new Map(presets.map((p) => [p.key, p]))

/* ────────────────────────────── Завершение ──────────────────────────────── */

export interface InstallInput {
  presetKey: string
  name: string
  mark: string
  domain: string
  locale: 'ru' | 'en'
  ownerEmail: string
  ownerName: string
}

export type InstallResult =
  | { ok: true; ownerId: string }
  | { ok: false; reason: 'already-installed' | 'invalid'; message?: string }

/**
 * Налить справочники, записать настройки, завести владельца — одной
 * транзакцией.
 *
 * Блокировка и `on conflict do nothing` не перестраховка: двое, открывшие
 * мастер одновременно, иначе получат две копии справочников и двух
 * владельцев, а разбирать это придётся руками в SQL.
 */
export async function completeInstall(input: InstallInput): Promise<InstallResult> {
  const email = input.ownerEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, reason: 'invalid', message: 'Проверьте адрес владельца' }
  }
  const preset = presetByKey.get(input.presetKey)
  if (!preset) return { ok: false, reason: 'invalid', message: 'Неизвестный набор' }
  if (!input.name.trim()) {
    return { ok: false, reason: 'invalid', message: 'Название портала не может быть пустым' }
  }

  const ownerId = await prisma.$transaction(async (tx) => {
    /* Ключ произвольный, но общий для всех установщиков этой базы. */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('backlog-install'))`

    const already = await tx.setting.findUnique({ where: { key: INSTALLED_KEY } })
    if (already) return null

    await seedReference(tx, preset)
    const owner = await createOwner(tx, email, input.ownerName)
    await writeSettings(tx, input)

    await tx.setting.create({
      data: { key: INSTALLED_KEY, value: new Date().toISOString() },
    })

    return owner
  })

  if (ownerId === null) return { ok: false, reason: 'already-installed' }

  invalidateCatalog()
  invalidateSettings()
  return { ok: true, ownerId }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Справочники из пресета.
 *
 * Идемпотентно: установка может идти по второму разу после неудачи,
 * и «строка уже есть» — не повод останавливать её на середине.
 */
async function seedReference(tx: Tx, preset: Preset): Promise<void> {
  for (const status of statuses) {
    await tx.status.upsert({
      where: { key: status.key },
      update: {},
      create: {
        key: status.key,
        name: status.name,
        nameEn: status.nameEn ?? null,
        color: status.color,
        shape: status.shape,
        position: status.position,
        showOnRoadmap: status.showOnRoadmap,
        isTerminal: status.isTerminal,
        isDefault: status.isDefault ?? false,
      },
    })
  }
  const statusIds = new Map(
    (await tx.status.findMany({ select: { id: true, key: true } })).map((s) => [s.key, s.id]),
  )

  for (const [index, type] of postTypes.entries()) {
    if (!preset.typeKeys.includes(type.key)) continue
    await tx.postType.upsert({
      where: { key: type.key },
      update: {},
      create: {
        key: type.key,
        name: type.name,
        nameEn: type.nameEn ?? null,
        description: type.description,
        descriptionEn: type.descriptionEn ?? null,
        chooserTitle: type.chooserTitle,
        chooserTitleEn: type.chooserTitleEn ?? null,
        prompt: type.prompt,
        promptEn: type.promptEn ?? null,
        formSchema: JSON.parse(JSON.stringify(type.formSchema)) as never,
        allowedStatusIds: type.allowedStatusKeys.flatMap((k) => {
          const id = statusIds.get(k)
          return id ? [id] : []
        }),
        defaultStatusId: statusIds.get(type.defaultStatusKey) ?? null,
        defaultPrivacy: type.defaultPrivacy,
        allowsVotes: type.allowsVotes,
        voteLabel: type.voteLabel,
        voteLabelEn: type.voteLabelEn ?? null,
        countLabel: type.countLabel,
        countLabelEn: type.countLabelEn ?? [],
        defaultSort: type.defaultSort,
        goesToBacklog: type.goesToBacklog,
        publicFeed: type.publicFeed,
        enabled: type.enabled,
        position: index,
      },
    })
  }

  for (const board of product.boards) {
    if (!preset.boardSlugs.includes(board.slug)) continue
    await tx.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: {
        slug: board.slug,
        name: board.name,
        nameEn: board.nameEn ?? null,
        description: board.description,
        descriptionEn: board.descriptionEn ?? null,
        visibility: board.visibility,
        position: board.position,
        hiddenFromNav: board.hiddenFromNav ?? false,
        requireCategory: board.requireCategory ?? false,
      },
    })
  }

  for (const stage of internalStatuses) {
    await tx.internalStatus.upsert({
      where: { key: stage.key },
      update: {},
      create: {
        key: stage.key,
        name: stage.name,
        hint: stage.hint,
        position: stage.position,
        isTerminal: stage.isTerminal,
        isDefault: stage.isDefault ?? false,
        publicResolution: stage.publicResolution ?? null,
      },
    })
    if (!stage.publicStatusKey) continue
    const internal = await tx.internalStatus.findUnique({ where: { key: stage.key } })
    const statusId = statusIds.get(stage.publicStatusKey)
    if (!internal || !statusId) continue
    await tx.statusMap.upsert({
      where: { internalStatusId_statusId: { internalStatusId: internal.id, statusId } },
      update: {},
      create: { internalStatusId: internal.id, statusId },
    })
  }

  await tx.intakeSource.upsert({
    where: { key: 'portal' },
    update: {},
    create: { key: 'portal', name: 'портал', autoPublish: true },
  })

  /* Сроки первого ответа: без них у обращения нет обещания, а очередь
     триажа теряет свой главный порядок. */
  const typeIds = new Map(
    (await tx.postType.findMany({ select: { id: true, key: true } })).map((t) => [t.key, t.id]),
  )
  for (const [index, policy] of slaPolicies.entries()) {
    const postTypeId = policy.typeKey ? (typeIds.get(policy.typeKey) ?? null) : null
    /* Политика для типа, которого нет в пресете, не нужна: она бы висела
       правилом без предмета. */
    if (policy.typeKey && !postTypeId) continue

    const exists = await tx.slaPolicy.findFirst({
      where: { postTypeId, severity: policy.severity ?? null },
    })
    if (exists) continue
    await tx.slaPolicy.create({
      data: {
        postTypeId,
        severity: policy.severity ?? null,
        firstResponseHours: policy.firstResponseHours,
        position: index,
      },
    })
  }
}

async function createOwner(tx: Tx, email: string, name: string): Promise<string> {
  const existing = await tx.appUser.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    /* Установка поверх базы, где этот человек уже есть: повышаем до владельца,
       а не заводим второго с тем же адресом. */
    await tx.appUser.update({
      where: { id: existing.id },
      /* `role` — должность в подписи под комментарием, права живут
         в `accessRole`: перепутать их значит завести владельца, который
         ничего не может. */
      data: { role: 'владелец', accessRole: 'owner', isTeam: true, trusted: true },
    })
    return existing.id
  }

  const created = await tx.appUser.create({
    data: {
      email,
      name: name.trim() || email.split('@')[0]!,
      role: 'владелец',
      accessRole: 'owner',
      isTeam: true,
      /* Первое обращение владельца не должно уйти в модерацию к нему же. */
      trusted: true,
    },
    select: { id: true },
  })
  return created.id
}

async function writeSettings(tx: Tx, input: InstallInput): Promise<void> {
  const values: Partial<Settings> = {
    name: input.name.trim(),
    mark: input.mark.trim() || input.name.trim().slice(0, 1).toUpperCase(),
    domain: input.domain.trim(),
    locale: input.locale,
  }

  for (const [key, value] of Object.entries(values)) {
    await tx.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    })
  }
}
