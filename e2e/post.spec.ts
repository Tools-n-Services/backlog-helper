import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'

/* Все сценарии файла — от имени вошедшего участника: голосовать
   и создавать обращения гость не может, и это проверяется отдельно
   в states.spec.ts. */
test.use({ storageState: stateFor('user') })

const FLAGSHIP_PATH = '/bugs/p/eksport-grafika-v-excel-teryaet-nochnye-smeny'
const FLAGSHIP = FLAGSHIP_PATH

/** «214» → 214: счётчик выводится с неразрывными пробелами-разрядами. */
function toNumber(text: string | null): number {
  return Number((text ?? '').replace(/\D/g, ''))
}

/**
 * Обратно в тот вид, в котором число стоит на кнопке. Нужно, чтобы ждать
 * значения через `toHaveText`, а не читать текст один раз: счётчик
 * обновляется дважды — предположительно и по ответу сервера.
 */
function formatted(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value)
}

/*
 * Голос — свойство пары (обращение, человек), и демонстрационный пользователь
 * за многое уже голосовал. Поэтому проверки идут от текущего состояния,
 * а не от предположения «голоса нет»: важно, что переключатель работает
 * в обе стороны и возвращает счётчик, а не то, с чего он начал.
 */
test('голос переключается в обе стороны и возвращает счётчик', async ({ page }) => {
  await page.goto(FLAGSHIP)

  const vote = page.getByRole('button', { name: /У меня тоже/ })
  const counter = vote.locator('.tnum')

  const before = toNumber(await counter.textContent())
  const votedAtStart = (await vote.getAttribute('aria-pressed')) === 'true'

  await vote.click()
  await expect(vote).toHaveAttribute('aria-pressed', String(!votedAtStart))
  await expect(counter).toHaveText(
    formatted(votedAtStart ? before - 1 : before + 1),
  )

  await vote.click()
  await expect(vote).toHaveAttribute('aria-pressed', String(votedAtStart))
  await expect(counter).toHaveText(formatted(before))
})

test('повторные нажатия не накручивают счётчик', async ({ page }) => {
  await page.goto(FLAGSHIP)

  const vote = page.getByRole('button', { name: /У меня тоже/ })
  const counter = vote.locator('.tnum')
  const before = toNumber(await counter.textContent())
  const votedAtStart = await vote.getAttribute('aria-pressed')

  for (let i = 0; i < 6; i++) await vote.click()

  /* Чётное число нажатий обязано вернуть исходное значение. */
  await expect(counter).toHaveText(formatted(before))
  await expect(vote).toHaveAttribute('aria-pressed', votedAtStart ?? 'false')
})

test('голосовать можно прямо из ленты, не открывая обращение', async ({ page }) => {
  await page.goto('/product')

  const firstVote = page.locator('article').first().getByRole('button')
  const before = await firstVote.getAttribute('aria-pressed')

  await firstVote.click()

  await expect(firstVote).toHaveAttribute(
    'aria-pressed',
    String(before !== 'true'),
  )
  expect(new URL(page.url()).pathname).toBe('/product')
})

test('обращение открывается отдельной страницей со своим адресом', async ({
  page,
}) => {
  await page.goto('/product')
  const title = await page.locator('article h3 a').first().textContent()
  await page.locator('article h3 a').first().click()

  await expect(page).toHaveURL(/\/product\/p\/.+/)
  await expect(page.locator('h1')).toHaveText(title!.trim())
})

test('тред показывает закреплённый ответ команды и вложенные ответы', async ({
  page,
}) => {
  await page.goto(FLAGSHIP)

  const thread = page.locator('section').filter({ hasText: 'Обсуждение' })
  await expect(thread.getByText('закреплено')).toBeVisible()
  await expect(thread.getByText('команда').first()).toBeVisible()
  /* Вложенный ответ живёт во втором уровне списка. */
  await expect(thread.locator('ul ul li').first()).toBeVisible()
})

test('смерженное обращение объясняет переход, а не молчит', async ({ page }) => {
  await page.goto(FLAGSHIP)

  const dupe = page.getByRole('link', {
    name: 'Ночные смены в выгрузке за месяц считаются дважды',
  })
  await dupe.click()

  await expect(page.getByText('Обращение объединено')).toBeVisible()
  await page.getByRole('link', { name: 'Перейти к обращению' }).click()
  await expect(page).toHaveURL(FLAGSHIP)
})

test('история статусов и голосовавшие видны на странице', async ({ page }) => {
  await page.goto(FLAGSHIP)

  await expect(page.getByText('История статусов')).toBeVisible()
  await expect(page.getByText('Голосовали')).toBeVisible()
  await expect(page.getByText(/и ещё/)).toBeVisible()
})

test('подписка переключается, а копирование подтверждает результат', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(FLAGSHIP)

  /* Демонстрационный пользователь голосовал за это обращение, а голос
     подписывает автоматически, — поэтому переключаем от текущего состояния. */
  const following = page.getByRole('button', { name: 'Вы следите' })
  const notFollowing = page.getByRole('button', { name: 'Следить за обновлениями' })

  if (await following.isVisible()) {
    await following.click()
    await expect(notFollowing).toBeVisible()
    await notFollowing.click()
  } else {
    await notFollowing.click()
  }
  await expect(following).toBeVisible()

  await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible()

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain(FLAGSHIP_PATH)
})
