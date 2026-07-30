/**
 * Снять признак установки (В4).
 *
 * Так выглядит консольная команда, которой открывают мастер повторно:
 * через веб этого сделать нельзя, и в сценарии тоже.
 */

import { prisma } from '@/core/db'

const [mode] = process.argv.slice(2)

async function main(): Promise<void> {
  if (mode === 'mark') {
    await prisma.setting.upsert({
      where: { key: 'installed_at' },
      create: { key: 'installed_at', value: new Date().toISOString() },
      update: {},
    })
    /* Мастер записывает название, знак, домен и язык — общие для портала.
       Оставить их значит сломать соседние сценарии, которые ждут пресет. */
    await prisma.setting.deleteMany({
      where: { key: { in: ['name', 'mark', 'domain', 'locale'] } },
    })
    return
  }
  await prisma.setting.deleteMany({ where: { key: 'installed_at' } })
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
