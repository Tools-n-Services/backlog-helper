import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'

/**
 * Бэклог. Проверяется то, ради чего он отделён от обращений: список — про
 * работы, а не про запросы, связь ведётся из карточки, и работа заводится
 * без единого обращения (06-backlog.md, раздел 0).
 */

test.describe('без прав команды', () => {
  test.use({ storageState: stateFor('user') })

  test('бэклог закрыт для тех, кто не в команде', async ({ page }) => {
    await page.goto('/admin/backlog')

    await expect(page.getByRole('heading', { name: 'Раздел для команды' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Завести работу' })).toHaveCount(0)
  })
})

test.describe('от имени команды', () => {
  test.use({ storageState: stateFor('admin') })

  test('список показывает работы с их спросом и фильтруется по типу', async ({ page }) => {
    await page.goto('/admin/backlog')

    const items = page.locator('main ul > li')
    const total = await items.count()
    expect(total).toBeGreaterThan(0)

    await page.getByRole('link', { name: /^Техдолг/ }).click()
    await expect(page).toHaveURL(/kind=tech/)
    /* Фильтр обязан сужать, иначе панель фасетов только мешает. */
    expect(await items.count()).toBeLessThan(total)
    await expect(page.getByText('Техдолг').first()).toBeVisible()
  })

  test('работа заводится без единого обращения', async ({ page }) => {
    await page.goto('/admin/backlog/new')

    const title = `Проверка e2e: перевести очередь на идемпотентность ${Date.now()}`
    await page.getByLabel('Название работы').fill(title)
    await page.getByLabel('Тип').selectOption('tech')
    await page.getByRole('button', { name: 'Создать' }).click()

    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    /* Ноль обращений — рабочее состояние техдолга, а не пустой экран. */
    await expect(page.getByText('Ни одного обращения')).toBeVisible()
  })

  test('обращение привязывается к работе и видно на его странице', async ({ page }) => {
    await page.goto('/admin/backlog')
    await page.locator('main ul > li a').first().click()

    const search = page.getByPlaceholder('Привязать обращение')
    await search.fill('выгруз')

    const candidate = page.locator('main button').filter({ hasText: 'Отчёты и экспорт' })
    await expect(candidate.first()).toBeVisible()
    const linkedTitle = (await candidate.first().innerText()).split('\n')[0]!
    await candidate.first().click()

    const linked = page.getByRole('link', { name: linkedTitle })
    await expect(linked).toBeVisible()

    /* Обратная сторона связи: на странице обращения команда видит,
       в какую работу оно попало. */
    const workTitle = await page.getByRole('heading', { level: 1 }).innerText()
    await linked.click()
    await expect(page.getByRole('link', { name: new RegExp(escape(workTitle)) })).toBeVisible()
  })
})

/** Заголовок работы уходит в регулярное выражение и может содержать что угодно. */
function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
