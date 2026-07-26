/**
 * Slug для URL обращения. Считается один раз при создании и больше не меняется
 * при переименовании (FR-182): иначе умирают ссылки из писем и выдачи.
 */

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
}

export function slugify(title: string, maxWords = 8): string {
  const base = title
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (!base) return 'post'
  return base.split(/\s+/).slice(0, maxWords).join('-')
}
