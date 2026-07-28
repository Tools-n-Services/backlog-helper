import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'

/* Все сценарии файла — от имени вошедшего участника: голосовать
   и создавать обращения гость не может, и это проверяется отдельно
   в states.spec.ts. */
test.use({ storageState: stateFor('user') })

/**
 * Критические сценарии ленты. Здесь проверяется ровно то, что нельзя проверить
 * юнит-тестом контракта: что клик действительно работает в браузере.
 *
 * Тест ловит реальный класс ошибок: контролируемый чекбокс, который не реагирует
 * до конца серверного перехода, и «Показать ещё», не вызывающий server action.
 */

test('фильтр отражается в URL и сужает ленту', async ({ page }) => {
  await page.goto('/product')

  const total = await page.locator('article').count()
  const statusGroup = page.getByRole('group').filter({ hasText: 'Статус' })
  const openRow = statusGroup.getByRole('checkbox').first()

  await openRow.check()
  await page.waitForURL(/status=/)

  expect(new URL(page.url()).searchParams.get('status')).toBeTruthy()
  await expect(openRow).toBeChecked()
  expect(await page.locator('article').count()).toBeLessThan(total)
})

test('«Показать ещё» дозагружает ленту, а не перерисовывает её', async ({ page }) => {
  await page.goto('/product')

  const before = await page.locator('article').count()
  const firstTitle = await page.locator('article h3').first().textContent()

  await page.getByRole('button', { name: /Показать ещё/ }).click()
  await expect(page.locator('article')).not.toHaveCount(before)

  const after = await page.locator('article').count()
  expect(after).toBeGreaterThan(before)
  /* Первая карточка не должна поменяться: страницы склеиваются, а не заменяются. */
  expect(await page.locator('article h3').first().textContent()).toBe(firstTitle)
})

test('смена фильтра не оставляет на экране прошлую выборку', async ({ page }) => {
  await page.goto('/product?status=open')
  const openCount = await page.locator('article').count()

  await page.goto('/product?status=building')
  const buildingCount = await page.locator('article').count()

  expect(buildingCount).not.toBe(openCount)
  const badges = await page.locator('article').getByText('В работе').count()
  expect(badges).toBe(buildingCount)
})

test('состояние ленты восстанавливается из ссылки', async ({ page }) => {
  await page.goto('/product?sort=new&status=open')

  await expect(page.getByRole('link', { name: 'Новые' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  const statusGroup = page.getByRole('group').filter({ hasText: 'Статус' })
  await expect(statusGroup.getByRole('checkbox').first()).toBeChecked()
})

test('пустая выборка показывает состояние, а не пустой экран', async ({ page }) => {
  await page.goto('/product?status=not-reproducible')

  await expect(page.getByText('Под эти фильтры ничего не подошло')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Сбросить фильтры' })).toBeVisible()
})
