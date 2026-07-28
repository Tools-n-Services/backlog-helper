import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { chromium, type FullConfig } from '@playwright/test'

import { ACCOUNTS, signIn, type Account } from './sign-in'

/**
 * Подготовка прогона: чистая база и по одной сессии на роль.
 *
 * Сессии открываются заранее и переиспользуются, а не заводятся в каждом
 * тесте, по прямой причине: на один адрес выдаётся не больше пяти ссылок
 * входа в час (FR-172). Десяток тестов от имени администратора упёрся бы
 * в это ограничение — и упал бы на правильно работающей защите.
 *
 * ВНИМАНИЕ: пересев стирает содержимое локальной базы разработки.
 */

export const STATE_DIR = path.join(process.cwd(), '.data', 'e2e')

export function stateFor(account: Account): string {
  return path.join(STATE_DIR, `${account}.json`)
}

export default async function globalSetup(config: FullConfig) {
  execFileSync('pnpm', ['db:seed'], { stdio: 'inherit' })

  /* Ящик чистим здесь: письма прошлых прогонов сбивают поиск свежей
     ссылки, а ссылки одноразовые — подобранная старая просто не сработает. */
  await rm(path.join(process.cwd(), '.data', 'mail'), { recursive: true, force: true })
  await mkdir(STATE_DIR, { recursive: true })

  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000'
  const browser = await chromium.launch()

  try {
    for (const account of Object.keys(ACCOUNTS) as Account[]) {
      const context = await browser.newContext({ baseURL })
      const page = await context.newPage()
      await signIn(page, account)
      await context.storageState({ path: stateFor(account) })
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
