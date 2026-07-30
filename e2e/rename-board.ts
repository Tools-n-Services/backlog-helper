/**
 * Правка справочника прямо в базе — так, как это сделает админка (В1).
 *
 * Сценарию нужно доказать, что портал читает справочники из базы, а не из
 * сборки. Админки настроек ещё нет (В5), поэтому правка идёт запросом:
 * проверяется путь чтения, а не экран, которого пока не существует.
 */

import { prisma } from '@/core/db'

const [slug, name] = process.argv.slice(2)

async function main(): Promise<void> {
  if (!slug || !name) throw new Error('нужны slug доски и новое название')
  await prisma.board.update({ where: { slug }, data: { name } })
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
