/**
 * Правка настроек прямо в базе — так, как это сделает мастер и админка (В2).
 *
 * Экранов настроек ещё нет (В4, В5), поэтому сценарий пишет значение
 * запросом: проверяется путь чтения и то, что портал берёт настройку
 * из базы, а не из сборки.
 */

import { prisma } from '@/core/db'

const [key, json] = process.argv.slice(2)

async function main(): Promise<void> {
  if (!key) throw new Error('нужен ключ настройки')

  if (json === undefined) {
    await prisma.setting.deleteMany({ where: { key } })
    return
  }

  const value = JSON.parse(json) as object
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
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
