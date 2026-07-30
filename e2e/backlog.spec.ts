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

  test('цитата добавляется в карточку и меняет охват', async ({ page }) => {
    await page.goto('/admin/backlog')
    await page.locator('main ul > li a').first().click()

    const reachBefore = await page.getByText('уникальные люди').locator('..').innerText()

    /* Добавление должно занимать секунды: форма открыта сразу, обязательное
       поле одно — сама цитата (FR-622). */
    await page
      .getByPlaceholder('Вставьте фразу целиком')
      .fill('Проверка e2e: без этого мы не сможем продлить контракт.')
    await page.getByRole('button', { name: 'Добавить' }).first().click()

    await expect(page.getByText('Проверка e2e: без этого мы')).toBeVisible()
    /* Охват пересчитывается сразу: цитату добавляют ради того, чтобы
       увидеть, как она меняет приоритет. */
    await expect
      .poll(async () => page.getByText('уникальные люди').locator('..').innerText())
      .not.toBe(reachBefore)
  })

  test('этап работы двигает публичный статус связанного обращения', async ({ page }) => {
    /* То, ради чего продукт существует (FR-632): человек проголосовал
       и узнаёт судьбу запроса, ничего для этого не делая. */
    await page.goto('/admin/backlog/new')
    const title = `Проверка e2e: гибкая выгрузка табеля ${Date.now()}`
    await page.getByLabel('Название работы').fill(title)
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.getByPlaceholder('Привязать обращение').fill('табеля')
    const candidate = page.locator('main button').filter({ hasText: 'напрямую в 1С' }).first()
    await expect(candidate).toBeVisible()
    await candidate.click()

    const linked = page.getByRole('link', { name: 'Выгрузка табеля напрямую в 1С' })
    await expect(linked).toBeVisible()

    /* Публичное следствие названо в самой подписи варианта: этап выбирают
       один раз, и в этот момент решают судьбу чужого обращения. */
    const stage = page.getByLabel('Этап')
    await expect(stage).toContainText('Готово к работе → Запланировано')
    await stage.selectOption('ready')
    await page.getByRole('button', { name: 'Сохранить' }).click()

    /* Статус виден и в карточке работы, и на публичной странице обращения:
       второе и есть то, что получит человек по ссылке из письма. */
    await expect(page.locator('main li').filter({ hasText: 'напрямую в 1С' })).toContainText(
      'Запланировано',
    )
    await linked.click()
    await expect(page.locator('h1')).toHaveText('Выгрузка табеля напрямую в 1С')
    await expect(page.getByText('Запланировано').first()).toBeVisible()
  })
})

/** Заголовок работы уходит в регулярное выражение и может содержать что угодно. */
function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
