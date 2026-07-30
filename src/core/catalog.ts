/**
 * Справочники портала из базы (В1, docs/09-install.md).
 *
 * До сих пор статусы, типы обращений и доски приложение читало из
 * `config/*.ts` — то есть из сборки. Пока портал разворачивался форком, это
 * работало: конфиг и база менялись одной выкладкой. Мастер установки меняет
 * модель — настройка живёт в базе и правится без пересборки, — и источником
 * правды становится база, а конфиг остаётся пресетом, из которого наливают
 * свежую установку.
 *
 * ЧТЕНИЕ СИНХРОННОЕ. Справочники нужны десяткам мест, включая мапперы
 * внутри мапперов: `toStatusView(row.status.key)` вызывается в двадцати
 * функциях слоя запросов. Сделать их async значит переписать слой целиком
 * ради данных, которые меняются раз в месяц.
 *
 * Поэтому здесь снимок: `loadCatalog()` асинхронно обновляет его на входе
 * в запрос, `catalog()` синхронно читает. Забыть загрузку нельзя — слой
 * запросов делает это сам за все свои методы (см. src/queries/index.ts),
 * а доменные функции вызывают загрузку явно.
 *
 * Кеш на процесс, без шины сообщений между приложением и воркером: поднимать
 * Redis ради имени статуса — цена, которую заплатит каждая установка.
 * Правка справочника доезжает до всех процессов за время жизни снимка,
 * а тот, кто правил, видит её сразу — мутации сбрасывают снимок сами.
 */

import { prisma } from '@/core/db'
import type { FormField, Privacy } from '@config/post-types'
import type { StatusShape } from '@config/statuses'

export interface StatusEntry {
  key: string
  name: string
  nameEn?: string
  shape: StatusShape
  color: string
  position: number
  showOnRoadmap: boolean
  isTerminal: boolean
  isDefault: boolean
}

export interface TypeEntry {
  key: string
  name: string
  nameEn?: string
  description: string
  descriptionEn?: string
  chooserTitle: string
  chooserTitleEn?: string
  prompt: string
  promptEn?: string
  formSchema: FormField[]
  allowedStatusKeys: string[]
  defaultStatusKey: string | null
  defaultPrivacy: Privacy
  allowsVotes: boolean
  voteLabel: string
  voteLabelEn?: string
  countLabel: [string, string, string]
  countLabelEn?: [string, string, string]
  defaultSort: 'trending' | 'new' | 'affected'
  goesToBacklog: boolean
  publicFeed: boolean
  enabled: boolean
  position: number
}

export interface BoardEntry {
  slug: string
  name: string
  nameEn?: string
  description: string
  descriptionEn?: string
  visibility: 'public' | 'private' | 'readonly'
  position: number
  hiddenFromNav: boolean
  requireCategory: boolean
}

export interface InternalStatusEntry {
  key: string
  name: string
  hint: string
  position: number
  isTerminal: boolean
  isDefault: boolean
  /** Публичный статус связанных обращений; null — переход внутренний. */
  publicStatusKey: string | null
  publicResolution: 'fixed' | 'wont_fix' | null
}

export interface Catalog {
  statuses: StatusEntry[]
  statusByKey: Map<string, StatusEntry>
  types: TypeEntry[]
  typeByKey: Map<string, TypeEntry>
  /** Только включённые, в порядке позиции — то, что видит человек в форме. */
  enabledTypes: TypeEntry[]
  boards: BoardEntry[]
  boardBySlug: Map<string, BoardEntry>
  internalStatuses: InternalStatusEntry[]
  internalStatusByKey: Map<string, InternalStatusEntry>
}

/**
 * Сколько снимок считается свежим.
 *
 * Десять секунд — компромисс между «правка видна сразу» и «каждый запрос
 * не ходит в базу за неизменным». Тот, кто правит справочник, видит своё
 * изменение немедленно: мутация сбрасывает снимок в своём процессе.
 */
const TTL_MS = Number(process.env.CATALOG_TTL_MS ?? 10_000)

let snapshot: Catalog | null = null
let loadedAt = 0
/** Загрузка в полёте: десять параллельных запросов не должны дать десять выборок. */
let inFlight: Promise<Catalog> | null = null

/** Загрузить справочники, если снимок устарел. Дёшево при попадании в кеш. */
export async function loadCatalog(): Promise<Catalog> {
  const fresh = snapshot && Date.now() - loadedAt < TTL_MS
  if (fresh) return snapshot!
  if (inFlight) return inFlight

  inFlight = read()
    .then((next) => {
      snapshot = next
      loadedAt = Date.now()
      return next
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * Синхронный доступ к снимку.
 *
 * Бросает исключение, а не подставляет пустой справочник: портал без статусов
 * выглядит как портал со сломанными данными, и разбирать это пришлось бы
 * по симптомам. Сообщение называет причину и лечение.
 */
export function catalog(): Catalog {
  if (!snapshot) {
    throw new Error(
      'Справочники не загружены: вызовите loadCatalog() на входе в запрос ' +
        '(слой запросов делает это сам, доменные функции — явно)',
    )
  }
  return snapshot
}

/** Снимок загружен хотя бы раз. Нужно там, где справочника может не быть. */
export function catalogReady(): boolean {
  return snapshot !== null
}

/**
 * Сбросить снимок.
 *
 * Вызывается из мутаций справочников: человек, который только что переименовал
 * статус, обязан увидеть новое имя на следующем экране, а не через десять
 * секунд. Остальные процессы догонят по времени жизни.
 */
export function invalidateCatalog(): void {
  snapshot = null
  loadedAt = 0
}

async function read(): Promise<Catalog> {
  const [statusRows, typeRows, boardRows, internalRows] = await Promise.all([
    prisma.status.findMany({ orderBy: { position: 'asc' } }),
    prisma.postType.findMany({ orderBy: { position: 'asc' } }),
    prisma.board.findMany({ orderBy: { position: 'asc' } }),
    prisma.internalStatus.findMany({
      orderBy: { position: 'asc' },
      include: { statusMaps: { include: { status: { select: { key: true } } } } },
    }),
  ])

  /* Тип ссылается на статусы идентификаторами, а весь код работает ключами:
     ключ переживает пересоздание строки, идентификатор — нет. */
  const statusKeyById = new Map(statusRows.map((s) => [s.id, s.key]))

  const statuses: StatusEntry[] = statusRows.map((s) => ({
    key: s.key,
    name: s.name,
    ...(s.nameEn ? { nameEn: s.nameEn } : {}),
    shape: s.shape as StatusShape,
    color: s.color,
    position: s.position,
    showOnRoadmap: s.showOnRoadmap,
    isTerminal: s.isTerminal,
    isDefault: s.isDefault,
  }))

  const types: TypeEntry[] = typeRows.map((t) => ({
    key: t.key,
    name: t.name,
    ...(t.nameEn ? { nameEn: t.nameEn } : {}),
    description: t.description,
    ...(t.descriptionEn ? { descriptionEn: t.descriptionEn } : {}),
    chooserTitle: t.chooserTitle,
    ...(t.chooserTitleEn ? { chooserTitleEn: t.chooserTitleEn } : {}),
    prompt: t.prompt,
    ...(t.promptEn ? { promptEn: t.promptEn } : {}),
    formSchema: asFormSchema(t.formSchema),
    allowedStatusKeys: t.allowedStatusIds.flatMap((id) => {
      const key = statusKeyById.get(id)
      return key ? [key] : []
    }),
    defaultStatusKey: t.defaultStatusId
      ? (statusKeyById.get(t.defaultStatusId) ?? null)
      : null,
    defaultPrivacy: t.defaultPrivacy as Privacy,
    allowsVotes: t.allowsVotes,
    voteLabel: t.voteLabel,
    ...(t.voteLabelEn ? { voteLabelEn: t.voteLabelEn } : {}),
    countLabel: asForms(t.countLabel) ?? ['', '', ''],
    ...(asForms(t.countLabelEn) ? { countLabelEn: asForms(t.countLabelEn)! } : {}),
    defaultSort: t.defaultSort,
    goesToBacklog: t.goesToBacklog,
    publicFeed: t.publicFeed,
    enabled: t.enabled,
    position: t.position,
  }))

  const boards: BoardEntry[] = boardRows.map((b) => ({
    slug: b.slug,
    name: b.name,
    ...(b.nameEn ? { nameEn: b.nameEn } : {}),
    description: b.description,
    ...(b.descriptionEn ? { descriptionEn: b.descriptionEn } : {}),
    visibility: b.visibility,
    position: b.position,
    hiddenFromNav: b.hiddenFromNav,
    requireCategory: b.requireCategory,
  }))

  const internalStatuses: InternalStatusEntry[] = internalRows.map((s) => ({
    key: s.key,
    name: s.name,
    hint: s.hint,
    position: s.position,
    isTerminal: s.isTerminal,
    isDefault: s.isDefault,
    /* Связь М:М в таблице, но смысл — один публичный статус на этап:
       «в разработке» не может означать одновременно два разных состояния
       для человека, который смотрит на своё обращение. */
    publicStatusKey: s.statusMaps[0]?.status.key ?? null,
    publicResolution:
      s.publicResolution === 'fixed' || s.publicResolution === 'wont_fix'
        ? s.publicResolution
        : null,
  }))

  return {
    statuses,
    statusByKey: new Map(statuses.map((s) => [s.key, s])),
    types,
    typeByKey: new Map(types.map((t) => [t.key, t])),
    enabledTypes: types.filter((t) => t.enabled),
    boards,
    boardBySlug: new Map(boards.map((b) => [b.slug, b])),
    internalStatuses,
    internalStatusByKey: new Map(internalStatuses.map((s) => [s.key, s])),
  }
}

/**
 * Схема формы из jsonb.
 *
 * Проверка минимальная — что это массив объектов с именем и видом. Полная
 * проверка схемы появится вместе с конструктором полей (В3): там она нужна
 * на записи, а здесь важно лишь не уронить портал на кривой строке.
 */
function asFormSchema(value: unknown): FormField[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (field): field is FormField =>
      typeof field === 'object' &&
      field !== null &&
      typeof (field as FormField).name === 'string' &&
      typeof (field as FormField).kind === 'string',
  )
}

/** Формы счётного слова: ровно три или ничего. */
function asForms(value: string[] | null | undefined): [string, string, string] | undefined {
  if (!value || value.length !== 3) return undefined
  return [value[0]!, value[1]!, value[2]!]
}
