import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'

/**
 * Релизы (FR-165).
 *
 * Экран проверяется на одно: видно ли до нажатия, что произойдёт с людьми.
 * Само нажатие здесь не делается намеренно — публикация рассылает письма
 * и меняет статусы обращений, на которые опираются остальные сценарии.
 * Механика публикации проверена отдельно, в юнит-тестах на очереди писем.
 */

test.describe('без прав команды', () => {
  test.use({ storageState: stateFor('user') })

  test('релизы закрыты для тех, кто не в команде', async ({ page }) => {
    await page.goto('/admin/releases')

    await expect(page.getByRole('heading', { name: 'Раздел для команды' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Опубликовать' })).toHaveCount(0)
  })
})

test.describe('от имени команды', () => {
  test.use({ storageState: stateFor('admin') })

  test('черновик показывает, какие обращения закроет публикация', async ({ page }) => {
    await page.goto('/admin/releases')

    const draft = page.locator('main article').first()
    await expect(draft).toBeVisible()
    /* Срок публикации назван снаружи — воркер выпустит запись сам (FR-166). */
    await expect(draft).toContainText('по сроку')

    /* На виду не текст релиза, а последствия: какие обращения закроются. */
    const closing = draft.getByRole('link', {
      name: 'Экспорт графика в Excel теряет ночные смены',
    })
    await expect(closing).toBeVisible()
  })

  test('публикация спрашивает подтверждение и называет число писем', async ({ page }) => {
    await page.goto('/admin/releases')

    const draft = page.locator('main article').first()
    await draft.getByRole('button', { name: 'Опубликовать' }).click()

    /* Числа, а не слово «уведомления»: письма отозвать нельзя, и решение
       принимается по количеству адресатов. */
    await expect(draft).toContainText(/Закроется \d+ обращени/)
    await expect(draft).toContainText(/уйдёт до [\d\s]+ пис/)
    await expect(draft).toContainText('Отменить нельзя')

    await draft.getByRole('button', { name: 'Отмена' }).click()
    await expect(draft.getByRole('button', { name: 'Опубликовать' })).toBeVisible()
  })

  test('черновик не открывается на портале до срока', async ({ page }) => {
    const response = await page.goto('/changelog/release-2-31')
    /* Ссылка на запись предсказуема по версии продукта: анонс не должен
       открываться раньше названной даты. */
    expect(response?.status()).toBe(404)
  })
})
