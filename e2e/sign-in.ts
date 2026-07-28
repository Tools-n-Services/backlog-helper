import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, type Page } from '@playwright/test'

/**
 * Вход в сценарных тестах — настоящий, через ссылку из письма.
 *
 * Раньше роль подставлялась cookie, и это было удобно ровно до того момента,
 * пока не выяснилось, что сам вход при этом не проверяется ни одним тестом.
 * Здесь проходится весь путь: форма → письмо → одноразовая ссылка → сессия.
 * Заодно это единственный способ убедиться, что вход не сломан, — обходного
 * пути в приложении больше нет.
 *
 * Письмо забирается из локального ящика `.data/mail`, куда его кладёт
 * `MAIL_PROVIDER=file`. Это не тестовая лазейка в приложении, а канал
 * доставки: тот же, которым пользуется разработчик на своей машине.
 */

const MAIL_DIR = path.join(process.cwd(), '.data', 'mail')

/** Учётные записи из сида. Пароля нет — адрес и есть всё, что нужно. */
export const ACCOUNTS = {
  owner: 'owner@example.com',
  admin: 'igor.remizov.9@example.com',
  moderator: 'alina.kovaleva.10@example.com',
  user: 'elena.sorokina.0@example.com',
  banned: 'banned.demo@example.com',
} as const

export type Account = keyof typeof ACCOUNTS

export async function signIn(page: Page, account: Account | string): Promise<void> {
  const email = account in ACCOUNTS ? ACCOUNTS[account as Account] : account
  const since = Date.now()

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.getByRole('button', { name: 'Получить ссылку' }).click()
  await expect(page).toHaveURL(/\/login\/sent/)

  await page.goto(await waitForSignInLink(email, since))
  /* Успешный вход уводит в профиль; иначе на экране причина отказа,
     и лучше упасть здесь, чем через десять шагов на пустой странице. */
  await expect(page).toHaveURL(/\/profile/)
}

/**
 * Ждёт письмо, отправленное ПОСЛЕ начала попытки входа.
 *
 * Отсечка по времени существенна: ящик общий на весь прогон, и без неё
 * тест подберёт ссылку из прошлого сценария — уже использованную,
 * потому что ссылки одноразовые.
 */
async function waitForSignInLink(email: string, since: number): Promise<string> {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const link = await findSignInLink(email, since)
    if (link) return link
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error(
    `Письмо со ссылкой входа для ${email} не появилось в ${MAIL_DIR}. ` +
      'Проверьте MAIL_PROVIDER=file.',
  )
}

async function findSignInLink(email: string, since: number): Promise<string | null> {
  let files: string[]
  try {
    files = await readdir(MAIL_DIR)
  } catch {
    return null
  }

  /* Имя файла начинается с времени отправки — свежие идут последними. */
  const mine = files
    .filter((name) => name.endsWith('.json'))
    .filter((name) => Number(name.split('-')[0]) >= since)
    .sort()
    .reverse()

  for (const name of mine) {
    const letter = JSON.parse(await readFile(path.join(MAIL_DIR, name), 'utf8')) as {
      to: string
      text: string
    }
    if (letter.to.toLowerCase() !== email.toLowerCase()) continue
    const link = /https?:\/\/\S*\/login\/verify\?token=\S+/.exec(letter.text)
    if (link) return link[0]
  }
  return null
}
