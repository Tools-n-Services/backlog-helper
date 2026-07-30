/**
 * Вернуть форму типа к пресету (В3).
 *
 * Сценарий правит схему в админке — общую для всего прогона. Возврат
 * к пресету и есть то, что делает «Сбросить» в админке: конфиг остаётся
 * набором значений по умолчанию, а не источником правды.
 */

import { prisma } from '@/core/db'
import { postTypeByKey } from '@config/post-types'

const [key] = process.argv.slice(2)

async function main(): Promise<void> {
  if (!key) throw new Error('нужен ключ типа обращения')
  const preset = postTypeByKey.get(key)
  if (!preset) throw new Error(`нет пресета для типа ${key}`)

  await prisma.postType.update({
    where: { key },
    data: { formSchema: JSON.parse(JSON.stringify(preset.formSchema)) as never },
  })
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
