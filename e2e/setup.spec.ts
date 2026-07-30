import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

/**
 * Настройка портала: значения в базе и мастер первого запуска (В2, В4).
 *
 * Один файл на оба сюжета намеренно. Они правят одно и то же — общие
 * настройки портала: название, знак, домен, язык. Параллельно они меняют
 * их друг у друга под руками, и падает то один, то другой, в зависимости
 * от того, кто успел раньше. Общий ресурс — общий поток.
 */

/* Один поток на весь файл: см. выше. */
test.describe.configure({ mode: 'serial' })

const TOKEN = 'e2e-install-token'

/**
 * Снимок настроек на сервере живёт CATALOG_TTL_MS (в прогоне — 1000 мс).
 * Правка идёт из другого процесса, поэтому сбросить снимок ей нечем:
 * в жизни это делает сама админка, сохраняя настройку у себя в процессе.
 * Значит сценарий обязан переждать время жизни, иначе под нагрузкой
 * параллельных работников он ловит собственную гонку, а не ошибку портала.
 */
const SNAPSHOT_TTL_MS = 1000

function set(key: string, json?: string): void {
  execFileSync('pnpm', ['exec', 'tsx', 'e2e/settings-edit.ts', key, ...(json ? [json] : [])], {
    stdio: 'inherit',
  })
}

function install(mode: 'open' | 'mark'): void {
  execFileSync('pnpm', ['exec', 'tsx', 'e2e/install-reset.ts', mode], { stdio: 'inherit' })
}

test.afterAll(() => {
  set('name')
  set('theme')
  set('features')
  install('mark')
})

test('название портала берётся из настроек, а не из сборки', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('banner')).toContainText('Ритмика')

  set('name', JSON.stringify('Портал Кулибина'))
  await page.waitForTimeout(SNAPSHOT_TTL_MS * 2)

  await page.goto('/')
  await expect(page.getByRole('banner')).toContainText('Портал Кулибина')
  await expect(page).toHaveTitle(/Портал Кулибина/)
})

test('фирменный цвет применяется к живому порталу', async ({ page }) => {
  set('theme', JSON.stringify({ ink: '#1d4ed8', inkHover: '#1e40af' }))
  await page.waitForTimeout(SNAPSHOT_TTL_MS * 2)

  await page.goto('/')
  const ink = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim(),
  )
  expect(ink).toBe('#1d4ed8')

  /* Цвет обязан доехать до реального элемента, а не только до переменной:
     знак продукта в шапке залит основным цветом. */
  const mark = page.getByRole('banner').locator('span').first()
  await expect(mark).toHaveCSS('background-color', 'rgb(29, 78, 216)')
})

test('выключенный раздел исчезает из навигации', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Что нового' })).toBeVisible()

  set('features', JSON.stringify({ changelog: false }))
  await page.waitForTimeout(SNAPSHOT_TTL_MS * 2)

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Что нового' })).toHaveCount(0)
  /* Остальные флаги остались от пресета: раздел записан не целиком. */
  await expect(page.getByRole('link', { name: 'Что делаем' })).toBeVisible()
})

test('без токена мастера не существует', async ({ page }) => {
  install('open')

  const response = await page.goto('/install')
  /* Не «нет прав», а 404: страница установки не должна подтверждать
     сканеру, что портал вообще свежий. */
  expect(response?.status()).toBe(404)
})

test('с токеном мастер ставит портал и закрывается', async ({ page }) => {
  install('open')
  const email = `installer-${Date.now()}@example.com`

  await page.goto(`/install/enter?token=${TOKEN}`)
  await expect(page).toHaveURL(/\/install$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Установка')

  /* Шаг 1: проверки среды. */
  await expect(page.getByText('База данных отвечает')).toBeVisible()
  await page.getByRole('button', { name: 'Дальше' }).click()

  /* Шаг 2: продукт. */
  await page.getByLabel('Название портала').fill('Портал установки')
  await page.getByLabel('Знак в шапке').fill('П')
  await page.getByRole('button', { name: 'Дальше' }).click()

  /* Шаг 3: набор. */
  await page.getByText('Минимальный').click()
  await page.getByRole('button', { name: 'Дальше' }).click()

  /* Шаг 4: почта — пробное письмо на адрес будущего владельца. */
  await page.getByLabel('Адрес для пробного письма').fill(email)
  await page.getByRole('button', { name: 'Отправить пробное письмо' }).click()
  await expect(page.getByRole('status')).toContainText('Письмо отправлено')
  await page.getByRole('button', { name: 'Дальше' }).click()

  /* Шаг 5: владелец. */
  await page.getByLabel('Имя').fill('Владелец Портала')
  await page.getByRole('button', { name: 'Установить портал' }).click()

  /* Мастер уводит на отдельную страницу: его собственная с этой секунды
     больше не существует. */
  await expect(page).toHaveURL(/\/install\/done$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('установлен')

  /* Владелец вошёл сразу, без письма: иначе кривая почта запирает портал. */
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Владелец Портала')

  /* Название из мастера — на портале. */
  await page.goto('/')
  await expect(page.getByRole('banner')).toContainText('Портал установки')

  /* И мастер закрыт: повторно его через веб не открыть. */
  const again = await page.goto(`/install/enter?token=${TOKEN}`)
  expect(again?.status()).toBe(404)
})
