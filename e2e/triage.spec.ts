import { expect, test, type Page } from '@playwright/test'

import { stateFor } from './global-setup'

/**
 * Очередь триажа. Проверяется главное требование поверхности: она обязана
 * проходиться целиком с клавиатуры — с мышью сотня обращений в день
 * не разбирается (07-ui-brief.md, раздел 6).
 */

/**
 * Клавиши начинают работать только после гидратации: до неё разметка
 * очереди уже на экране, а обработчика ещё нет. Ждём признак готовности,
 * иначе первое нажатие уходит в пустоту и проверка ловит не то.
 */
async function openQueue(page: Page) {
  await page.goto('/admin/triage')
  await page.locator('[data-queue-ready="true"]').waitFor()
}

test.describe('без прав команды', () => {
  test.use({ storageState: stateFor('user') })

  test('очередь закрыта для тех, кто не в команде', async ({ page }) => {
    await page.goto('/admin/triage')

    await expect(page.getByRole('heading', { name: 'Раздел для команды' })).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('от имени команды', () => {
  test.use({ storageState: stateFor('admin') })

  test('очередь проходится стрелками без мыши', async ({ page }) => {
  await openQueue(page)

  const rows = page.locator('tbody tr')
  await expect(rows.first()).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')

  /* j/k — та же навигация: руки не уходят с домашнего ряда. */
  await page.keyboard.press('k')
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('j')
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')
})

  test('курсор не уезжает за границы очереди', async ({ page }) => {
  await openQueue(page)

  const rows = page.locator('tbody tr')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp')
  await expect(rows.first()).toHaveAttribute('aria-current', 'true')

  const count = await rows.count()
  for (let i = 0; i < count + 5; i++) await page.keyboard.press('ArrowDown')
  await expect(rows.nth(count - 1)).toHaveAttribute('aria-current', 'true')
})

  test('решение ставится цифрой и убирает обращение из очереди', async ({ page }) => {
  await openQueue(page)

  const rows = page.locator('tbody tr')
  const before = await rows.count()
  const firstRef = await rows.first().locator('td').nth(3).textContent()

  await page.keyboard.press('1')

  await expect(rows).toHaveCount(before - 1)
  await expect(page.getByText(/Решений принято/)).toBeVisible()
  /* Именно разобранное обращение ушло, а не случайное. */
  const newFirst = await rows.first().locator('td').nth(3).textContent()
  expect(newFirst).not.toBe(firstRef)
})

  test('Enter открывает обращение', async ({ page }) => {
  await openQueue(page)

  /* Нажимать раньше, чем очередь отрисована, бессмысленно: обработчик
     навешивается вместе с ней. */
  await expect(page.locator('tbody tr').first()).toBeVisible()

  await page.keyboard.press('Enter')
  /* Запас по времени: это первый переход на страницу обращения в прогоне,
     и на холодную она и компилируется, и читает базу. */
  await expect(page).toHaveURL(/\/p\//, { timeout: 15_000 })
})

  test('поиск открывается слэшем, Esc возвращает управление очереди', async ({
  page,
}) => {
  await openQueue(page)

  await page.keyboard.press('/')
  await expect(page.locator('#triage-search')).toBeFocused()

  /* Пока фокус в поиске, цифры набираются, а не выносят решение. */
  await page.keyboard.type('1')
  await expect(page.locator('#triage-search')).toHaveValue('1')

  await page.keyboard.press('Escape')
  await expect(page.locator('#triage-search')).not.toBeFocused()
})

  test('подсказка по горячим клавишам открывается', async ({ page }) => {
  await openQueue(page)

  await page.keyboard.press('?')
  await expect(page.getByText('перемещение по очереди')).toBeVisible()
  await expect(page.getByText('решение по обращению')).toBeVisible()
})

  test('состояние SLA читается без цвета', async ({ page }) => {
  await page.goto('/admin/triage?sort=sla')

  /* У каждой строки есть текстовая подпись состояния и форма маркера —
     цветовой разницы при чтении по диагонали не хватает. */
  const labels = page.locator('tbody tr').first().locator('td').first()
  await expect(labels).toContainText(/просрочено|скоро срок|в норме|отвечено/)
})

  test('метрики очереди видны рядом с ней', async ({ page }) => {
  await openQueue(page)

  await expect(page.getByText('без ответа')).toBeVisible()
  await expect(page.getByText('просрочено').first()).toBeVisible()
  await expect(page.getByText(/самому старому/)).toBeVisible()
})

  test('фильтр «только просроченные» сужает очередь', async ({ page }) => {
  await openQueue(page)
  const before = await page.locator('tbody tr').count()

  await page.getByRole('link', { name: 'Только просроченные' }).click()
  await expect(page).toHaveURL(/overdue=1/)

  const after = await page.locator('tbody tr').count()
  expect(after).toBeLessThan(before)
  expect(after).toBeGreaterThan(0)
})

  test('сортировка по сроку поднимает просроченные наверх', async ({ page }) => {
  await page.goto('/admin/triage?sort=sla')

  const first = page.locator('tbody tr').first().locator('td').first()
  await expect(first).toContainText('просрочено')
})

})
