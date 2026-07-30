/**
 * Вложения: что принимаем и сколько храним. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Список разрешённых типов — белый, а не чёрный (FR-512). Чёрный список
 * исполняемых обречён: расширений больше, чем в нём успевают перечислить,
 * и первый же `.scr` или архив с макросом окажется вне его. Белый список
 * отвергает всё незнакомое — включая то, о чём мы ещё не слышали.
 *
 * Размеры разные по типам не из экономии: видео на 50 МБ — нормальный
 * скринкаст бага, а «лог» на 50 МБ означает, что человек приложил не тот
 * файл, и лучше сказать ему об этом сразу.
 */

export type AttachmentKindKey = 'image' | 'video' | 'log' | 'har' | 'other'

export interface AttachmentRule {
  kind: AttachmentKindKey
  name: string
  /** Точные MIME-типы, которые принимаем. */
  mimes: string[]
  /** Расширения, по которым уточняем тип: HAR приходит как обычный json. */
  extensions?: string[]
  maxBytes: number
}

const MB = 1024 * 1024

export const attachmentRules: AttachmentRule[] = [
  {
    kind: 'har',
    name: 'HAR',
    /* Раньше остальных: HAR — это `application/json`, и без уточнения
       по расширению он попал бы в «логи» с их лимитом. */
    mimes: ['application/json', 'application/har+json', 'text/plain'],
    extensions: ['.har'],
    maxBytes: 25 * MB,
  },
  {
    kind: 'image',
    name: 'Изображение',
    mimes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    maxBytes: 10 * MB,
  },
  {
    kind: 'video',
    name: 'Видео',
    mimes: ['video/mp4', 'video/webm'],
    maxBytes: 50 * MB,
  },
  {
    kind: 'log',
    name: 'Лог',
    mimes: ['text/plain', 'text/csv', 'application/json', 'application/x-ndjson'],
    extensions: ['.log', '.txt', '.json', '.csv'],
    maxBytes: 5 * MB,
  },
]

/** Сколько файлов принимаем к одному обращению. */
export const maxAttachmentsPerPost = 5

/**
 * Сколько живёт загруженный, но не отправленный файл.
 *
 * Человек выбрал скриншот и закрыл вкладку — файл уже в хранилище, а
 * обращения нет. Без срока такие висят вечно, и хранилище растёт от
 * брошенных черновиков.
 */
export const stagingHours = 24

/**
 * Retention после закрытия обращения (FR-562).
 *
 * Скриншоты и логи — это персональные данные: чужие имена, адреса, номера
 * заказов. Держать их бессрочно значит превратить портал в хранилище PII,
 * которое никто не собирался заводить. Само обращение остаётся.
 */
export const retentionDaysAfterClose = 90
