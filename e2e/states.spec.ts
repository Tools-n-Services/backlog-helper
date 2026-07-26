import { expect, test, type Page } from '@playwright/test'

/**
 * Служебные состояния (07-ui-brief.md, раздел 5).
 *
 * Проверяется не вёрстка, а два правила брифа: у отказа есть причина
 * и есть действие, которое из него выводит.
 */

async function setRole(page: Page, role: string) {
  await page.context().addCookies([
    { name: 'viewer-role', value: role, url: 'http://localhost:3000' },
  ])
}

test('вход: письмо отправлено — отдельный экран, а не тост', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#email').fill('e.sorokina@ritmika.app')
  await page.getByRole('button', { name: 'Получить ссылку' }).click()

  await expect(page).toHaveURL(/\/login\/sent/)
  await expect(page.locator('h1')).toContainText('Ссылка')
  await expect(page.getByText('e.sorokina@ritmika.app')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Отправить снова' })).toBeVisible()
})

test('закрытая доска объясняет причину, а не отдаёт 404', async ({ page }) => {
  const response = await page.goto('/enterprise')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Доска закрыта' })).toBeVisible()
  await expect(page.getByText(/платным тарифом/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible()
})

test('заблокированный аккаунт видит причину и путь обжалования', async ({ page }) => {
  await setRole(page, 'banned')
  await page.goto('/product/new')

  await expect(page.getByRole('heading', { name: 'Аккаунт заблокирован' })).toBeVisible()
  await expect(page.getByText(/Причина:/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Оспорить блокировку' })).toBeVisible()
  /* Читать при этом можно — иначе блокировка выглядит удалением аккаунта. */
  await expect(page.getByRole('link', { name: 'Читать обращения' })).toBeVisible()
})

test('гость видит вход вместо формы создания', async ({ page }) => {
  await setRole(page, 'guest')
  await page.goto('/product/new')

  await expect(page.getByText(/после входа/)).toBeVisible()
  await expect(page.locator('#field-title')).toHaveCount(0)
})

test('гость не голосует, а попадает на вход', async ({ page }) => {
  await setRole(page, 'guest')
  await page.goto('/product')

  const vote = page.locator('article').first().getByRole('link').first()
  await vote.click()
  await expect(page).toHaveURL(/\/login/)
})

test('404 называет причину и даёт выход', async ({ page }) => {
  const response = await page.goto('/product/p/takogo-obrashcheniya-net')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'На главную' })).toBeVisible()
})

test('ошибка ленты предлагает повтор, а не «что-то пошло не так»', async ({ page }) => {
  await page.goto('/product?fail=1')

  await expect(page.getByRole('heading', { name: 'Лента не загрузилась' })).toBeVisible()
  await expect(page.getByText(/Обращения на месте/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()
  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0)
})

test('отписка работает без входа', async ({ page }) => {
  await setRole(page, 'guest')
  await page.goto('/unsubscribe?post=' + encodeURIComponent('Экспорт графика в Excel'))

  await expect(page.getByRole('heading', { name: 'Вы отписались' })).toBeVisible()
  await expect(page.getByText(/Экспорт графика в Excel/)).toBeVisible()
  await expect(page.getByText(/без входа/)).toBeVisible()
})

test('профиль показывает обращения, голоса и настройки писем', async ({ page }) => {
  await setRole(page, 'user')
  await page.goto('/profile')

  await expect(page.getByRole('heading', { name: 'Елена Сорокина' })).toBeVisible()
  await expect(page.locator('article').first()).toBeVisible()

  await page.getByRole('link', { name: 'За что голосовал' }).click()
  await expect(page).toHaveURL(/tab=votes/)
  await expect(page.locator('article').first()).toBeVisible()

  await page.getByRole('link', { name: 'Уведомления' }).click()
  await expect(page.getByText('Смена статуса моих обращений')).toBeVisible()
  await expect(page.getByText(/не чаще раза в две недели/)).toBeVisible()
})

test('гостю профиль предлагает вход, а не пустой экран', async ({ page }) => {
  await setRole(page, 'guest')
  await page.goto('/profile')

  await expect(page.getByText(/после входа/)).toBeVisible()
  /* Именно в содержимом: «Войти» есть и в шапке. */
  await expect(page.locator('#main').getByRole('link', { name: 'Войти' })).toBeVisible()
})

test('переключатель роли меняет то, что видно на портале', async ({ page }) => {
  await page.goto('/product')
  const switcher = page.getByTestId('viewer-switcher')

  await switcher.getByRole('button', { name: 'Гость' }).click()
  await expect(page.getByRole('link', { name: 'Войти' }).first()).toBeVisible()

  await switcher.getByRole('button', { name: 'Команда' }).click()
  await expect(page.getByRole('link', { name: /Профиль/ })).toBeVisible()
})
