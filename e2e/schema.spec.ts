import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

import { stateFor } from './global-setup'
import { signIn } from './sign-in'

/**
 * Конструктор полей (В3, docs/09-install.md).
 *
 * Критерий всей работы: поле, заведённое в админке, появляется в форме,
 * доезжает до обращения и видно на его странице. Пока это не так, редактор
 * схемы — это форма, которая делает вид, что что-то настраивает.
 */

const LABEL = 'Номер договора'
const VALUE = 'Д-1024'

/* Один поток: сценарии правят общую схему типа «Идея». */
test.describe.configure({ mode: 'serial' })

test.afterAll(() => {
  execFileSync('pnpm', ['exec', 'tsx', 'e2e/reset-schema.ts', 'idea'], { stdio: 'inherit' })
})

test.describe('администратор', () => {
  test.use({ storageState: stateFor('admin') })

  test('заводит поле в форме типа', async ({ page }) => {
    await page.goto('/admin/types/idea')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Идея')

    await page.getByRole('button', { name: 'Добавить поле' }).click()

    /* Новое поле — последнее в списке; подпись пустая, и сохранение
       без неё обязано быть отвергнуто. */
    await page.getByRole('button', { name: 'Сохранить форму' }).click()
    /* Не по роли: у Next свой объявитель маршрутов с той же ролью alert. */
    await expect(page.getByText('Схема не сохранена')).toBeVisible()
    await expect(page.getByText(/Подпись не может быть пустой/)).toBeVisible()

    const rows = page.locator('ol > li')
    await rows.last().getByLabel('Подпись').fill(LABEL)
    await page.getByRole('button', { name: 'Сохранить форму' }).click()

    await expect(page.getByRole('status')).toContainText('Сохранено')
  })

  test('системное поле нельзя превратить в другое', async ({ page }) => {
    await page.goto('/admin/types/bug')

    const severity = page.locator('ol > li').filter({ hasText: 'severity' }).first()
    await expect(severity).toContainText('системное')
    /* Вид системного поля закрыт: за severity стоит срок первого ответа
       и порядок очереди триажа. */
    await expect(severity.getByLabel('Вид')).toBeDisabled()
  })
})

test.describe('участник', () => {
  /* Свой аккаунт на прогон, а не общий демонстрационный: лимит — два
     обращения в час на человека, и сценарий проверки лимита в соседнем
     файле выбирает его до конца. Делить одного автора значит падать
     по очереди на правильно работающей защите. */
  test('видит новое поле в форме и его значение на обращении', async ({ page }) => {
    await signIn(page, `schema-check-${Date.now()}@example.com`)
    await page.goto('/product/new?type=idea')

    const title = `Проверка конструктора ${Date.now()}`
    await page.locator('#field-title').fill(title)
    await page.locator('#field-details').fill('Тело обращения для проверки полей.')

    const custom = page.getByLabel(LABEL)
    await expect(custom).toBeVisible()
    await custom.fill(VALUE)

    await page.getByRole('button', { name: 'Отправить обращение' }).click()
    await page.getByRole('link', { name: 'Открыть обращение' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    /* Значение доехало до обращения и показано с подписью из схемы. */
    await expect(page.getByText(LABEL)).toBeVisible()
    await expect(page.getByText(VALUE)).toBeVisible()
  })
})
