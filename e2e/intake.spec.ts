import { expect, test, type Page } from '@playwright/test'

import { stateFor } from './global-setup'

/* Все сценарии файла — от имени вошедшего участника: голосовать
   и создавать обращения гость не может, и это проверяется отдельно
   в states.spec.ts. */
test.use({ storageState: stateFor('user') })

/**
 * Последовательно, а не параллельно.
 *
 * Обращения теперь создаются по-настоящему, и лимит «не больше двух в час»
 * считается по автору. Все сценарии этого файла работают от одного
 * демонстрационного пользователя, поэтому параллельный запуск означает,
 * что они делят лимит между собой и мешают друг другу непредсказуемо.
 */
test.describe.configure({ mode: 'serial' })

async function fillBug(page: Page, title: string) {
  await page.locator('#field-title').fill(title)
  await page.locator('#field-actual').fill('Часы после полуночи не переносятся на следующую дату')
  await page.locator('#field-expected').fill('Часы разбиты по датам')
  await page.locator('#field-steps').fill('1. Открыть график\n2. Экспорт в Excel')
  await page.locator('#field-frequency').selectOption('always')
  await page.locator('#field-severity').selectOption('major')
}

test('тип выбирается до формы, а не после', async ({ page }) => {
  await page.goto('/bugs/new')

  await expect(page.getByText('Шаг 1 из 2')).toBeVisible()
  await expect(page.locator('h1')).toContainText('С чем вы пришли')
  await expect(page.locator('#field-title')).toHaveCount(0)

  await page.getByRole('link', { name: /Что-то работает не так/ }).click()
  await expect(page.getByText('Шаг 2 из 2')).toBeVisible()
  await expect(page.locator('#field-title')).toBeVisible()
})

test('у бага и идеи разные формы', async ({ page }) => {
  await page.goto('/bugs/new?type=bug')
  await expect(page.locator('#field-steps')).toBeVisible()
  await expect(page.locator('#field-severity')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Окружение' })).toBeVisible()

  await page.goto('/bugs/new?type=idea')
  await expect(page.locator('#field-steps')).toHaveCount(0)
  await expect(page.locator('#field-severity')).toHaveCount(0)
  await expect(page.locator('#field-details')).toBeVisible()
})

test('окружение подставляется само и разворачивается для правки', async ({ page }) => {
  await page.goto('/bugs/new?type=bug')

  const block = page.getByRole('button', { name: /проверить|свернуть/ })
  await expect(block).toBeVisible()
  /* Что-то уже собрано: пустой блок означал бы, что автосбор не сработал. */
  await expect(block).not.toContainText('Данные не собрались')

  await block.click()
  await expect(page.locator('#field-environment')).toBeVisible()
  await expect(page.locator('#field-environment')).toContainText('Часовой пояс')
})

test('похожие находятся на вводе заголовка и позволяют проголосовать вместо создания', async ({
  page,
}) => {
  await page.goto('/bugs/new?type=bug')
  await page.locator('#field-title').fill('экспорт теряет ночные смены')

  const inset = page.getByText(/Похоже, об этом уже писали/)
  await expect(inset).toBeVisible({ timeout: 5000 })

  const candidate = page.getByRole('link', {
    name: 'Экспорт графика в Excel теряет ночные смены',
  })
  await expect(candidate).toBeVisible()

  /* Голос из врезки настоящий, и демонстрационный пользователь мог уже
     голосовать за это обращение — проверяем переключение, а не исходное
     состояние. */
  const card = page.locator('article', { has: candidate })
  const voteButton = card.getByRole('button')
  const votedAtStart = (await voteButton.getAttribute('aria-pressed')) === 'true'

  await voteButton.click()
  await expect(voteButton).toHaveAttribute('aria-pressed', String(!votedAtStart))
  await expect(voteButton).toHaveText(
    votedAtStart ? 'Голосовать за это' : 'Ваш голос учтён',
  )
})

test('на бессмысленный заголовок похожие не предлагаются', async ({ page }) => {
  await page.goto('/bugs/new?type=bug')
  await page.locator('#field-title').fill('абракадабра квартет фонарь')

  await page.waitForTimeout(800)
  await expect(page.getByText(/Похоже, об этом уже писали/)).toHaveCount(0)
})

test('пустая форма показывает ошибки у полей и сводкой сверху', async ({ page }) => {
  await page.goto('/bugs/new?type=bug')
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  const summary = page.locator('form [role="alert"]')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Шаги воспроизведения')

  await expect(page.locator('#field-title-error')).toContainText('Обязательное поле')
  await expect(page.locator('#field-title')).toHaveAttribute('aria-invalid', 'true')
})

test('заполненная форма создаёт обращение, которое открывается по ссылке', async ({
  page,
}) => {
  await page.goto('/bugs/new?type=bug')
  const title = `Табель не сходится с графиком в марте ${Date.now()}`
  await fillBug(page, title)
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  await expect(page.getByText('Обращение отправлено')).toBeVisible()
  /* Номер обращения — то, что называют в поддержке, поэтому он на экране. */
  await expect(page.getByText(/^RTM-\d+$/)).toBeVisible()

  /* Обращение теперь существует по своему адресу — это и проверяем,
     а не только надпись об успехе. */
  await page.getByRole('link', { name: 'Открыть обращение' }).click()
  await expect(page).toHaveURL(/\/bugs\/p\//, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

test('превышение лимита объясняет причину и срок, а не падает', async ({ page }) => {
  /* Лимит — 2 обращения в час (config/product.ts). Третье должно упереться. */
  for (let i = 1; i <= 3; i++) {
    await page.goto('/bugs/new?type=bug')
    await fillBug(page, `Проверка лимита номер ${i}`)
    await page.getByRole('button', { name: 'Отправить обращение' }).click()
    await expect(
      page.getByText(/Обращение отправлено|предел/),
    ).toBeVisible({ timeout: 5000 })
  }

  await expect(page.getByText(/предел/)).toBeVisible()
  await expect(page.getByText(/Можно продолжить через/)).toBeVisible()
})
