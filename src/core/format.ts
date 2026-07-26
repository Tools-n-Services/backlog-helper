/**
 * Форматирование дат и чисел.
 *
 * Относительные подписи считаются в слое queries, а не в компоненте: иначе
 * серверный и клиентский рендер разойдутся на границе секунды и React
 * пожалуется на несовпадение разметки.
 */

const MS_PER_DAY = 86_400_000

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
