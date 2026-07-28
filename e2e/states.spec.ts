import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'
import { signIn } from './sign-in'

/**
 * Служебные состояния (07-ui-brief.md, раздел 5).
 *
 * Проверяется не вёрстка, а два правила брифа: у отказа есть причина
 * и есть действие, которое из него выводит.
 */

/* Гость по умолчанию: сессии нет, пока её не открыли. Тесты, которым
   нужен вошедший, объявляют это через test.use. */

test('вход: письмо отправлено — отдельный экран, а не тост', async ({ page }) => {
  /* Свой адрес на каждый прогон: на один адрес приходится не больше пяти
     ссылок в час, и повторные запуски за час упирались бы в этот лимит —
     то есть тест падал бы на правильно работающей защите. */
  const email = `login-screen-${Date.now()}@example.com`

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.getByRole('button', { name: 'Получить ссылку' }).click()

  await expect(page).toHaveURL(/\/login\/sent/)
  await expect(page.locator('h1')).toContainText('Ссылка')
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Отправить снова' })).toBeVisible()
})

test('закрытая доска объясняет причину, а не отдаёт 404', async ({ page }) => {
  const response = await page.goto('/enterprise')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Доска закрыта' })).toBeVisible()
  await expect(page.getByText(/платным тарифом/)).toBeVisible()
  /* Именно в содержимом: «Войти» есть и в шапке у любого гостя. */
  await expect(page.locator('#main').getByRole('link', { name: 'Войти' })).toBeVisible()
})

test.describe('заблокированный аккаунт', () => {
  test.use({ storageState: stateFor('banned') })

  test('видит причину и путь обжалования', async ({ page }) => {
    await page.goto('/product/new')

    await expect(page.getByRole('heading', { name: 'Аккаунт заблокирован' })).toBeVisible()
    await expect(page.getByText(/Причина:/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Оспорить блокировку' })).toBeVisible()
    /* Читать при этом можно — иначе блокировка выглядит удалением аккаунта. */
    await expect(page.getByRole('link', { name: 'Читать обращения' })).toBeVisible()
  })
})

test('гость видит вход вместо формы создания', async ({ page }) => {
  await page.goto('/product/new')

  await expect(page.getByText(/после входа/)).toBeVisible()
  await expect(page.locator('#field-title')).toHaveCount(0)
})

test('гость не голосует, а попадает на вход', async ({ page }) => {
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
  await page.goto('/unsubscribe?post=' + encodeURIComponent('Экспорт графика в Excel'))

  await expect(page.getByRole('heading', { name: 'Вы отписались' })).toBeVisible()
  await expect(page.getByText(/Экспорт графика в Excel/)).toBeVisible()
  await expect(page.getByText(/без входа/)).toBeVisible()
})

test.describe('вошедший участник', () => {
  test.use({ storageState: stateFor('user') })

  test('профиль показывает обращения, голоса и настройки писем', async ({ page }) => {
    await page.goto('/profile')

    await expect(page.getByRole('heading', { name: 'Елена Сорокина' })).toBeVisible()
    await expect(page.locator('article').first()).toBeVisible()

    /* Строго внутри навигации профиля: «Уведомления» — ещё и название
       категории, и в списке собственных обращений таких ссылок несколько. */
    const tabs = page.getByLabel('Разделы профиля')

    await tabs.getByRole('link', { name: 'За что голосовал' }).click()
    await expect(page).toHaveURL(/tab=votes/)
    await expect(page.locator('article').first()).toBeVisible()

    await tabs.getByRole('link', { name: 'Уведомления' }).click()
    await expect(page.getByText('Смена статуса моих обращений')).toBeVisible()

    /* Настройка обязана пережить перезагрузку: галочка, которая возвращается
       обратно, — это ровно тот обман, ради устранения которого экран
       и переделан. */
    const status = page.locator('input[name="status"]')
    const before = await status.isChecked()

    await status.setChecked(!before)
    await page.getByRole('button', { name: 'Сохранить' }).click()

    await page.goto('/profile?tab=notifications')
    await expect(page.locator('input[name="status"]')).toBeChecked({ checked: !before })
  })

})

/**
 * Выход — со своей сессией, а не с общей.
 *
 * Выход прекращает сессию в базе, а не только чистит cookie. Общая на группу
 * сессия после этого перестала бы работать и у соседних тестов — то есть
 * правильно работающий выход ронял бы половину прогона.
 */
test('выход прекращает сессию, а не только чистит cookie', async ({ page }) => {
  await signIn(page, `logout-${Date.now()}@example.com`)

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/profile')
  await expect(page.getByText(/после входа/)).toBeVisible()
})

test('гостю профиль предлагает вход, а не пустой экран', async ({ page }) => {
  await page.goto('/profile')

  await expect(page.getByText(/после входа/)).toBeVisible()
  /* Именно в содержимом: «Войти» есть и в шапке. */
  await expect(page.locator('#main').getByRole('link', { name: 'Войти' })).toBeVisible()
})

/**
 * Вход целиком, от формы до сессии.
 *
 * Единственный тест, который проходит весь путь своими руками, а не берёт
 * готовую сессию: обходного пути в продукте больше нет, и если вход сломан,
 * сломано всё остальное.
 */
test('вход по ссылке из письма открывает сессию', async ({ page }) => {
  await page.goto('/product')
  await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible()

  /* Свой адрес: общий упёрся бы в лимит ссылок при повторных прогонах. */
  await signIn(page, `fresh-${Date.now()}@example.com`)

  await page.goto('/product')
  await expect(page.getByRole('link', { name: /Профиль/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти' })).toHaveCount(0)
})
