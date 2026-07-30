/**
 * Палитра и оформление. ФОРК ПРАВИТ ЭТОТ ФАЙЛ (значения — дефолты установки).
 *
 * Здесь лежит то, из чего портал берёт цвет, когда его не задали в админке.
 * Значения совпадают с `theme/tokens.css`: файл темы описывает вид сборки,
 * этот — вид свежей установки, и расхождение между ними означало бы, что
 * портал меняет цвета сам собой после первой правки настроек.
 *
 * Палитра статусов — набор пар «фон + текст» с проверенным контрастом
 * (≥ 4.5:1). Статус ссылается на запись по имени, а не хранит hex: набор
 * конечен, и статус, заведённый в админке, не может остаться без цвета —
 * а раньше мог, потому что цвета жили в сборке, а статусы в базе.
 */

export interface PaletteEntry {
  key: string
  /** Название для выбора в админке. */
  name: string
  bg: string
  fg: string
}

export const statusPalette: PaletteEntry[] = [
  { key: 'slate', name: 'Синий', bg: '#eef1f6', fg: '#3c5878' },
  { key: 'amber', name: 'Янтарный', bg: '#fbf1df', fg: '#8a5d12' },
  { key: 'violet', name: 'Фиолетовый', bg: '#ededfa', fg: '#43439b' },
  { key: 'teal', name: 'Бирюзовый', bg: '#e4f1ef', fg: '#155f55' },
  { key: 'green', name: 'Зелёный', bg: '#e5f0e7', fg: '#1f6b36' },
  { key: 'plum', name: 'Сливовый', bg: '#f2ecf7', fg: '#5f4483' },
  { key: 'rust', name: 'Терракотовый', bg: '#f7ecec', fg: '#8a3f3f' },
  { key: 'gray', name: 'Серый', bg: '#efefee', fg: '#5c5c5c' },
]

export const paletteByKey = new Map(statusPalette.map((p) => [p.key, p]))

/** Запись палитры по имени; неизвестное имя — серый, а не пустота. */
export function paletteEntry(key: string): PaletteEntry {
  return paletteByKey.get(key) ?? paletteByKey.get('gray')!
}

export interface ThemeConfig {
  /**
   * Основной цвет: текст, тёмные полотна, все действия.
   *
   * Палитра интерфейса монохромна по решению брифа (07-ui-brief.md, раздел 2):
   * цвет несёт семантику, а не бренд. Поэтому «фирменный цвет» здесь один,
   * и он же цвет кнопок — иначе брендирование начинает спорить со статусами.
   */
  ink: string
  inkHover: string
}

export const theme: ThemeConfig = {
  ink: '#0a0a0a',
  inkHover: '#2e2e2e',
}
