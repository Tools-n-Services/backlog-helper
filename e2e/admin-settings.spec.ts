import { expect, test, type Page } from '@playwright/test'

import { stateFor } from './global-setup'

/**
 * Админка настроек (В5, docs/09-install.md).
 *
 * Критерий: то, что настраивается, настраивается без доступа к серверу.
 * Поэтому сценарий не проверяет форму — он заводит доску и статус глазами
 * администратора и смотрит на портал.
 *
 * Заводит свои, а не правит существующие: доски и статусы общие для всего
 * прогона, и переименование «Запланировано» ломает соседний файл, который
 * этого статуса ждёт. Уборка за собой — часть сценария.
 */

const BOARD_SLUG = 'admin-check'
const BOARD_NAME = 'Проверка админки'
const STATUS_KEY = 'admin-check'
const STATUS_NAME = 'На проверке админки'

/* Один поток: правки общие для всего портала. */
test.describe.configure({ mode: 'serial' })
test.use({ storageState: stateFor('admin') })

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('status')).toContainText('Сохранено')
}

test('новая доска из админки появляется на портале и убирается обратно', async ({
  page,
}) => {
  await page.goto('/admin/boards')
  await page.getByRole('button', { name: 'Добавить доску' }).click()

  const fresh = page.locator('ol > li').last()
  await fresh.getByLabel('Адрес').fill(BOARD_SLUG)
  await fresh.getByLabel('Название', { exact: true }).fill(BOARD_NAME)
  await fresh.getByLabel('Описание', { exact: true }).fill('Временная доска сценария.')
  await save(page)

  await page.goto('/')
  await expect(page.getByRole('link', { name: BOARD_NAME, exact: true })).toBeVisible()

  /* Пустую доску удалить можно — на неё ничто не ссылается. */
  await page.goto('/admin/boards')
  await page
    .locator('ol > li')
    .filter({ hasText: BOARD_NAME })
    .first()
    .getByRole('button', { name: /Убрать/ })
    .click()
  await save(page)

  await page.goto('/')
  await expect(page.getByRole('link', { name: BOARD_NAME, exact: true })).toHaveCount(0)
})

test('доску с обращениями удалить нельзя, и она остаётся на месте', async ({ page }) => {
  await page.goto('/admin/boards')

  await page
    .locator('ol > li')
    .filter({ hasText: 'Ошибки' })
    .first()
    .getByRole('button', { name: /Убрать/ })
    .click()
  await page.getByRole('button', { name: 'Сохранить' }).click()

  /* Не по роли: у Next свой объявитель маршрутов с той же ролью alert. */
  await expect(page.getByText(/не пустая/)).toBeVisible()

  await page.goto('/bugs')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ошибки')
})

test('новый статус получает колонку на дорожной карте', async ({ page }) => {
  await page.goto('/admin/statuses')
  await page.getByRole('button', { name: 'Добавить статус' }).click()

  const fresh = page.locator('ol > li').last()
  await fresh.getByLabel('Ключ').fill(STATUS_KEY)
  await fresh.getByLabel('Название', { exact: true }).fill(STATUS_NAME)
  await fresh.getByLabel('Показывать на дорожной карте').check()
  await save(page)

  /* Цвет и форма приезжают из палитры: статус, заведённый в админке,
     выглядит наравне со встроенными, а не серым пятном. */
  await page.goto('/roadmap')
  await expect(page.getByText(STATUS_NAME).first()).toBeVisible()

  await page.goto('/admin/statuses')
  await page
    .locator('ol > li')
    .filter({ hasText: STATUS_NAME })
    .first()
    .getByRole('button', { name: /Убрать/ })
    .click()
  await save(page)
})

test('портал без начального статуса не сохраняется', async ({ page }) => {
  await page.goto('/admin/statuses')

  const initial = page.locator('ol > li').filter({ hasText: 'Новое' }).first()
  await initial.getByLabel('Начальный').uncheck()
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText(/ровно один/)).toBeVisible()
})
