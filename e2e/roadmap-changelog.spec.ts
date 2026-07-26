import { expect, test } from '@playwright/test'

test('с роадмапа можно открыть обращение', async ({ page }) => {
  await page.goto('/roadmap')

  const columns = page.locator('main section')
  await expect(columns.first()).toBeVisible()

  const card = page.locator('main article h3 a').first()
  const title = (await card.textContent())!.trim()
  await card.click()

  await expect(page).toHaveURL(/\/p\//)
  await expect(page.locator('h1')).toHaveText(title)
})

test('«показать все» раскрывает колонку целиком, не уводя со страницы', async ({
  page,
}) => {
  await page.goto('/roadmap')

  const column = page.locator('main section').filter({ hasText: 'Готово' }).first()
  const before = await column.locator('article').count()

  await column.getByRole('link', { name: /Показать все/ }).click()
  await page.waitForURL(/expand=/)

  /* Роадмап сквозной по доскам, поэтому раскрытие происходит на месте:
     ссылка в ленту одной доски потеряла бы часть карточек. */
  expect(new URL(page.url()).pathname).toBe('/roadmap')

  const expanded = page.locator('main section').filter({ hasText: 'Готово' }).first()
  expect(await expanded.locator('article').count()).toBeGreaterThan(before)
  await expect(expanded.getByRole('link', { name: 'Свернуть' })).toBeVisible()
})

test('фильтр по доске сужает роадмап и виден в адресе', async ({ page }) => {
  await page.goto('/roadmap')
  const before = await page.locator('main article').count()

  /* Именно в панели роадмапа: «Ошибки» есть и в шапке портала. */
  await page
    .getByRole('navigation', { name: 'Фильтр по доске' })
    .getByRole('link', { name: 'Ошибки' })
    .click()
  await expect(page).toHaveURL(/board=bugs/)

  const after = await page.locator('main article').count()
  expect(after).toBeLessThanOrEqual(before)
})

test('лента релизов фильтруется по типу изменения', async ({ page }) => {
  await page.goto('/changelog')
  const before = await page.locator('main article').count()

  await page
    .getByRole('navigation', { name: 'Фильтр по типу' })
    .getByRole('link', { name: 'Исправлено' })
    .click()
  await expect(page).toHaveURL(/kind=fixed/)

  /* Внутри записи остаются только исправления — иначе фильтр отвечает
     «здесь что-то чинили», но не показывает что.
     В разметке текст в обычном регистре, верхний даёт CSS. */
  const badges = page.locator('main article li').getByText(
    /^(Новое|Улучшено|Исправлено)$/,
  )
  const texts = await badges.allTextContents()
  expect(texts.length).toBeGreaterThan(0)
  for (const text of texts) expect(text.trim()).toBe('Исправлено')

  expect(await page.locator('main article').count()).toBeLessThanOrEqual(before)
})

test('запись релиза показывает, какие обращения она закрыла', async ({ page }) => {
  await page.goto('/changelog')
  await page.locator('main article h2 a').first().click()

  await expect(page).toHaveURL(/\/changelog\/release-/)
  await expect(page.getByText('Закрытые обращения')).toBeVisible()

  const closed = page.getByRole('link', {
    name: 'Шаблоны графика под сезон',
  })
  await expect(closed).toBeVisible()

  await closed.click()
  await expect(page).toHaveURL(/\/p\//)
  await expect(page.locator('h1')).toHaveText('Шаблоны графика под сезон')
})

test('несуществующий релиз даёт 404', async ({ page }) => {
  const response = await page.goto('/changelog/net-takogo-reliza')
  expect(response?.status()).toBe(404)
})
