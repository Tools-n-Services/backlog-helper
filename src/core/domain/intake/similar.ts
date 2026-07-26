/**
 * Похожесть заголовков для поиска дубликатов при создании обращения (FR-122).
 *
 * Реализовано так, как это делает Postgres `pg_trgm`, потому что в фазе B
 * запрос переедет в SQL (`word_similarity(title, :q) > :threshold`), и порог,
 * подобранный здесь, должен остаться верным там.
 *
 * Почему триграммы, а не стемминг: при вводе заголовка нужны опечатки
 * и частичные совпадения, а не морфология (02-data-model.md, «Поиск»).
 */

/** Порог по умолчанию. Ниже — начинает предлагать несвязанное. */
export const SIMILARITY_THRESHOLD = 0.42

/**
 * Нормализация как в pg_trgm: регистр вниз, всё, кроме букв и цифр, —
 * в разделители.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Триграммы слова с дополнением: два пробела в начале и один в конце —
 * ровно так формирует их Postgres, поэтому короткие слова тоже дают совпадения.
 */
export function trigrams(text: string): Set<string> {
  const result = new Set<string>()
  for (const word of normalize(text).split(/\s+/)) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) {
      result.add(padded.slice(i, i + 3))
    }
  }
  return result
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const item of a) if (b.has(item)) n++
  return n
}

/** Аналог `similarity()`: симметричная мера Жаккара. */
export function similarity(a: string, b: string): number {
  const left = trigrams(a)
  const right = trigrams(b)
  if (left.size === 0 || right.size === 0) return 0
  const shared = intersectionSize(left, right)
  return shared / (left.size + right.size - shared)
}

/**
 * Аналог `word_similarity()`: какая доля триграмм запроса нашлась в тексте.
 *
 * Именно она нужна для поиска на вводе: пользователь набрал треть заголовка,
 * и симметричная мера этого не увидит — она штрафует за длину чужого текста.
 */
export function wordSimilarity(query: string, target: string): number {
  const q = trigrams(query)
  if (q.size === 0) return 0
  return intersectionSize(q, trigrams(target)) / q.size
}

/**
 * Минимальная длина запроса, при которой имеет смысл искать. На двух символах
 * похоже всё на свете, и врезка «похожие» превращается в шум.
 */
export const MIN_QUERY_LENGTH = 4

export function isSearchable(query: string): boolean {
  return normalize(query).length >= MIN_QUERY_LENGTH
}
