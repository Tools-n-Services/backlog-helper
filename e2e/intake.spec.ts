import { expect, test, type Page } from '@playwright/test'

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
  /* Что-то уже собрано: пустая заглушка означала бы, что автосбор не сработал. */
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

  const voteInstead = page.getByRole('button', { name: 'Голосовать за это' }).first()
  await voteInstead.click()
  await expect(page.getByRole('button', { name: 'Ваш голос учтён' })).toBeVisible()
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

test('заполненная форма отправляется и объясняет, что дальше', async ({ page }) => {
  await page.goto('/bugs/new?type=bug')
  await fillBug(page, 'Табель не сходится с графиком в марте')
  await page.getByRole('button', { name: 'Отправить обращение' }).click()

  await expect(page.getByText('Обращение отправлено')).toBeVisible()
  await expect(page.getByText(/после проверки/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Вернуться к ленте' })).toBeVisible()
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
