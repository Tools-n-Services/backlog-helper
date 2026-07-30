import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

import { TRANSLATED } from './translation-fixture'

/**
 * Два языка портала и перевод обращений (FR-181).
 *
 * Проверяется то, ради чего это делалось: человек переключает язык и читает
 * чужое обращение на своём, видит, что перед ним перевод, и может открыть
 * оригинал. Сам переводчик в прогоне не участвует — перевод положен в базу
 * заранее, как это сделал бы воркер.
 */

const POST = '/bugs/p/eksport-grafika-v-excel-teryaet-nochnye-smeny'

/* Один поток на файл: подготовка базы идёт в beforeAll, а он выполняется
   в каждом работнике. Параллельные работники клали бы один и тот же перевод
   одновременно и спорили за уникальный индекс. */
test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  execFileSync('pnpm', ['exec', 'tsx', 'e2e/seed-translation.ts'], { stdio: 'inherit' })
})

test('переключатель языка меняет интерфейс и держится между страницами', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Что улучшить')

  await page.getByRole('group', { name: /Язык|Language/ }).getByText('EN').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('What to improve')

  /* Выбор языка — свойство человека, а не страницы: он обязан пережить
     переход, иначе переключатель приходится жать на каждом экране. */
  await page.goto('/roadmap')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'What we are doing',
  )
})

test('обращение читается на языке смотрящего, с пометкой и оригиналом', async ({
  page,
}) => {
  await page.goto(POST)
  /* По-русски перевода нет и пометки быть не должно: текст и так на языке
     читателя, а «переведено» на нём выглядело бы поломкой. */
  await expect(page.getByText('Переведено с русского')).toHaveCount(0)

  await page.getByRole('group', { name: /Язык|Language/ }).getByText('EN').click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TRANSLATED.title)
  await expect(page.getByText(TRANSLATED.body)).toBeVisible()

  const notice = page.locator('main').getByText('Translated from Russian').first()
  await expect(notice).toBeVisible()

  /* Автор писал конкретные слова — читатель обязан иметь возможность их увидеть. */
  await page.getByRole('button', { name: 'Show original' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Экспорт графика в Excel',
  )
  await expect(page.getByRole('button', { name: 'Show translation' }).first()).toBeVisible()
})

test('комментарий переводится отдельно от обращения', async ({ page }) => {
  await page.goto(POST)
  await page.getByRole('group', { name: /Язык|Language/ }).getByText('EN').click()

  await expect(page.getByText(TRANSLATED.comment)).toBeVisible()
})
