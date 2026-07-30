/**
 * Форматирование дат и чисел.
 *
 * Относительные подписи считаются в слое queries, а не в компоненте: иначе
 * серверный и клиентский рендер разойдутся на границе секунды и React
 * пожалуется на несовпадение разметки.
 */

const MS_PER_DAY = 86_400_000

/** Сколько символов тела показывается карточкой в ленте. */
const EXCERPT_LENGTH = 200

/**
 * Краткое описание для карточки ленты.
 *
 * Считается из тела обращения, а не хранится отдельной колонкой: отдельное
 * поле пришлось бы поддерживать в актуальном состоянии при каждой правке
 * текста, и оно неизбежно разъехалось бы с содержимым.
 */
export function excerptOf(details: string): string {
  const first = details.split(/\n{2,}/)[0]?.trim() ?? ''
  if (first.length <= EXCERPT_LENGTH) return first
  /* Режем по границе слова: обрыв на середине слова читается как ошибка. */
  const cut = first.slice(0, EXCERPT_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—-]$/, '')}…`
}

export function relativeLabel(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / MS_PER_DAY)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  if (days < 31) {
    const weeks = Math.floor(days / 7)
    return `${weeks} нед. назад`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} мес. назад`
  }
  const years = Math.floor(days / 365)
  return `${years} г. назад`
}

/**
 * Размер файла словами: «4,2 МБ».
 *
 * Живёт здесь, а не рядом с загрузкой вложений: подпись под полем выбора
 * файла рисует браузер, и модуль с драйвером Postgres в клиентскую сборку
 * тянуть нельзя.
 */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`

  const mb = bytes / (1024 * 1024)
  /* Круглые значения — без дробной части: «до 25,0 МБ» в подписи к полю
     выглядит как результат вычисления, а это просто предел из конфига. */
  return Number.isInteger(mb) ? `${mb} МБ` : `${mb.toFixed(1).replace('.', ',')} МБ`
}
