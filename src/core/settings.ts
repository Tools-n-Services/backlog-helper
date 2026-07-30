/**
 * Настройки портала из базы (В2, docs/09-install.md).
 *
 * Название, домен, язык, лимиты, фичефлаги и оформление правятся без
 * пересборки: мастер настраивает портал, который уже запущен, а админка —
 * тот, который уже работает.
 *
 * Порядок чтения: значение из базы, если оно есть, иначе дефолт из
 * `config/*.ts`. Именно в таком порядке, и это важнее, чем кажется: ключ,
 * добавленный в новой версии образа, начинает работать сразу у всех
 * установок — без миграции данных и без строки в чужой базе.
 *
 * Снимок и синхронное чтение — как у справочников (`catalog.ts`), по той же
 * причине: настройки нужны в мапперах и компонентах, а превращать их чтение
 * в async значило бы переписать слой ради данных, которые меняются раз
 * в месяц. Загрузка идёт вместе со справочником: одна точка входа, один
 * поход в базу.
 */

import { prisma } from '@/core/db'
import { product } from '@config/product'
import { theme as themeDefaults } from '@config/theme'

export interface Features {
  roadmap: boolean
  changelog: boolean
  voterList: boolean
  bugIntake: boolean
}

export interface Limits {
  postsPerDay: number
  postsPerHour: number
  feedPageSize: number
}

export interface NeedsInfo {
  remindAfterDays: number
  closeAfterDays: number
}

export interface Theme {
  ink: string
  inkHover: string
}

export interface Settings {
  name: string
  mark: string
  domain: string
  locale: 'ru' | 'en'
  features: Features
  limits: Limits
  needsInfo: NeedsInfo
  trendingHalfLifeDays: number
  releasedStatusKey: string
  theme: Theme
}

/** Ключи строк в таблице: раздел админки сохраняет ровно один. */
export type SettingKey = keyof Settings

/**
 * Значения свежей установки.
 *
 * Конфиг не удалён, а сменил роль: он больше не источник правды в рантайме,
 * а пресет, из которого наливается новая установка и берётся всё, чего
 * в базе ещё нет.
 */
export function defaultSettings(): Settings {
  return {
    name: product.name,
    mark: product.mark,
    domain: product.domain,
    locale: product.locale,
    features: { ...product.features },
    limits: { ...product.limits },
    needsInfo: { ...product.needsInfo },
    trendingHalfLifeDays: product.trendingHalfLifeDays,
    releasedStatusKey: product.releasedStatusKey,
    theme: { ...themeDefaults },
  }
}

const TTL_MS = Number(process.env.CATALOG_TTL_MS ?? 10_000)

let snapshot: Settings | null = null
let loadedAt = 0
let inFlight: Promise<Settings> | null = null

/** Загрузить настройки, если снимок устарел. Дёшево при попадании в кеш. */
export async function loadSettings(): Promise<Settings> {
  if (snapshot && Date.now() - loadedAt < TTL_MS) return snapshot
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
 * Синхронное чтение настроек.
 *
 * В отличие от справочника здесь есть чем ответить без базы — дефолтами
 * пресета. Портал с названием из конфига выглядит работающим, и это верно:
 * настройки описывают оформление, а не данные. Падать из-за незагруженного
 * снимка значило бы менять «не то название» на «белый экран».
 */
export function settings(): Settings {
  return snapshot ?? defaultSettings()
}

/** Пометить настройки устаревшими: следующее чтение сходит в базу. */
export function invalidateSettings(): void {
  loadedAt = 0
}

/**
 * Записать раздел настроек.
 *
 * Целиком по ключу, а не по полю: раздел админки сохраняется одной кнопкой,
 * и запись по полю означала бы гонку между соседними переключателями.
 * Слияние с дефолтами при чтении делает частичную запись безопасной.
 */
export async function saveSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object, updatedAt: new Date() },
  })
  invalidateSettings()
}

/** Вернуть раздел к значению пресета: строка удаляется, дефолт возвращается. */
export async function resetSetting(key: SettingKey): Promise<void> {
  await prisma.setting.deleteMany({ where: { key } })
  invalidateSettings()
}

async function read(): Promise<Settings> {
  const defaults = defaultSettings()

  let rows: { key: string; value: unknown }[] = []
  try {
    rows = await prisma.setting.findMany({ select: { key: true, value: true } })
  } catch {
    /* База недоступна или таблицы ещё нет — до установки это норма.
       Портал в этот момент всё равно не работает, но экран установки
       должен уметь нарисоваться. */
    return defaults
  }

  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const scalar = <T>(key: SettingKey, fallback: T, kind: 'string' | 'number'): T => {
    const value = stored.get(key)
    return typeof value === kind ? (value as T) : fallback
  }

  return {
    name: scalar('name', defaults.name, 'string'),
    mark: scalar('mark', defaults.mark, 'string'),
    domain: scalar('domain', defaults.domain, 'string'),
    locale: stored.get('locale') === 'en' || stored.get('locale') === 'ru'
      ? (stored.get('locale') as 'ru' | 'en')
      : defaults.locale,
    /* Слияние по полю, а не замена объекта: флаг, добавленный в новой версии
       образа, обязан работать у установки, чей раздел записан до него. */
    features: merge(defaults.features, stored.get('features')),
    limits: merge(defaults.limits, stored.get('limits')),
    needsInfo: merge(defaults.needsInfo, stored.get('needsInfo')),
    trendingHalfLifeDays: scalar(
      'trendingHalfLifeDays',
      defaults.trendingHalfLifeDays,
      'number',
    ),
    releasedStatusKey: scalar('releasedStatusKey', defaults.releasedStatusKey, 'string'),
    theme: merge(defaults.theme, stored.get('theme')),
  }
}

/**
 * Наложить сохранённое на дефолт по полям.
 *
 * Тип поля обязан совпасть с дефолтным: в jsonb попадает всё, что записали,
 * включая строку там, где ждали число. Портал от такой строки не должен
 * менять поведение — иначе лимит «пять» и лимит «пять» из текста поведут
 * себя по-разному.
 */
function merge<T extends object>(defaults: T, stored: unknown): T {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return defaults
  }
  const source = stored as Record<string, unknown>
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = source[key]
    if (value !== undefined && typeof value === typeof defaults[key]) {
      result[key] = value as T[keyof T & string]
    }
  }
  return result
}
