/**
 * Снимает скриншоты портала для лендинга.
 *
 *   pnpm dev                       # в отдельном терминале
 *   node landing/capture.mjs       # перезапишет landing/assets/*.png
 *
 * Роль «команда» ставится cookie-заглушкой фазы A (src/core/session.ts);
 * после B2 её заменит настоящая сессия, и здесь поменяется только addCookies.
 */

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = new URL('./assets/', import.meta.url).pathname

/* В кадре не нужны: прототипный переключатель роли, подвал и индикатор дев-режима Next.js. */
const HIDE = `
  [data-testid="viewer-switcher"] { display: none !important }
  footer { display: none !important }
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important }
`

const browser = await chromium.launch()

async function shot(name, { path, role = 'user', width = 1440, height = 900, prepare } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  })
  await ctx.addCookies([{ name: 'viewer-role', value: role, domain: 'localhost', path: '/' }])

  const page = await ctx.newPage()
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: HIDE })
  if (prepare) await prepare(page)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}${name}.png` })
  await ctx.close()
  console.log('ok', name)
}

await shot('feed', { path: '/product' })

await shot('post', {
  path: '/product/p/uchet-pererabotok-s-preduprezhdeniem-do-publikatsii-grafika',
})

await shot('triage', { path: '/admin/triage', role: 'team' })

await shot('roadmap', { path: '/roadmap' })

await shot('intake', {
  path: '/product/new?type=idea',
  prepare: async (page) => {
    await page.locator('#field-title').fill('Копирование недели на месяц вперёд')
    await page.waitForTimeout(1200)
  },
})

await browser.close()
