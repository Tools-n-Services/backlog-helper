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

  test('релиз собирается на портале: черновик, изменение, обращение', async ({ page }) => {
    await page.goto('/admin/releases')
    await page.getByRole('link', { name: 'Завести релиз' }).click()

    const title = `Проверка e2e: релиз ${Date.now()}`
    await page.getByLabel('Заголовок').fill(title)
    await page.getByLabel('Версия').fill('9.1')
    await page.getByLabel('Вводка').fill('Проверка сборки записи на портале.')
    await page.getByRole('button', { name: 'Создать черновик' }).click()

    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText('черновик без срока')).toBeVisible()

    /* Изменение со своим типом: без него запись не попадёт ни под один
       фильтр ленты (FR-162). */
    await page.getByPlaceholder('Что изменилось — одной строкой').fill('Ночные смены в отчёте')
    await page.getByRole('button', { name: 'Добавить' }).click()
    await expect(page.getByText('Ночные смены в отчёте')).toBeVisible()

    /* И то, ради чего всё: обращения, которые публикация закроет. */
    await page.getByPlaceholder('Привязать обращение').fill('выгруз')
    const candidate = page.locator('main button').filter({ hasText: 'выгруз' }).first()
    await expect(candidate).toBeVisible()
    const linked = (await candidate.innerText()).split('\n')[0]!
    await candidate.click()

    await expect(page.getByRole('link', { name: linked })).toBeVisible()

    /* Черновик виден в списке готовящихся — вместе с тем, что он закроет. */
    await page.goto('/admin/releases')
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('черновик не открывается на портале до срока', async ({ page }) => {
    const response = await page.goto('/changelog/release-2-31')
    /* Ссылка на запись предсказуема по версии продукта: анонс не должен
       открываться раньше названной даты. */
    expect(response?.status()).toBe(404)
  })
})
