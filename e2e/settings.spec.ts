import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

/**
 * Настройки портала живут в базе (В2, docs/09-install.md).
 *
 * Критерий тот же, что у справочников: правка видна на работающем портале
 * без пересборки. Без этого мастер установки не может настроить ничего —
 * он ведь настраивает уже запущенный портал.
 */

/* Один поток: сценарии правят общие для портала настройки. */
test.describe.configure({ mode: 'serial' })

/**
 * Снимок настроек на сервере живёт CATALOG_TTL_MS (в прогоне — 250 мс).
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

test.afterAll(() => {
  set('name')
  set('theme')
  set('features')
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
