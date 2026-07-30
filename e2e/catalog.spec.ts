import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

/**
 * Справочники живут в базе, а не в сборке (В1, docs/09-install.md).
 *
 * Это главный критерий готовности всего переноса: если название доски
 * меняется в базе и портал показывает новое — значит настройка мастером
 * и админкой вообще возможна. Если нет — всё остальное бессмысленно,
 * сколько бы экранов сверху ни нарисовали.
 */

const ORIGINAL = 'Продукт'
const RENAMED = 'Пожелания'

function rename(slug: string, name: string): void {
  execFileSync('pnpm', ['exec', 'tsx', 'e2e/rename-board.ts', slug, name], {
    stdio: 'inherit',
  })
}

/* Один поток: сценарий правит общую для всех строку справочника. */
test.describe.configure({ mode: 'serial' })

test.afterAll(() => {
  rename('product', ORIGINAL)
})

test('переименование доски в базе видно на портале без пересборки', async ({ page }) => {
  /* Точное совпадение: карточка доски на главной — тоже ссылка, и её
     доступное имя включает счётчик обращений. */
  await page.goto('/')
  await expect(page.getByRole('link', { name: ORIGINAL, exact: true })).toBeVisible()

  rename('product', RENAMED)
  /* Ждём, пока протухнет снимок справочника: правка идёт из другого
     процесса, и сбросить его ей нечем — в жизни это делает админка. */
  await page.waitForTimeout(1500)

  await page.goto('/')
  await expect(page.getByRole('link', { name: RENAMED, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: ORIGINAL, exact: true })).toHaveCount(0)

  /* И на самой доске, а не только в навигации: название приходит из одного
     справочника, и расхождение между экранами означало бы два источника. */
  await page.goto('/product')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(RENAMED)
})
