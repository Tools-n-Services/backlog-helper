import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  /* Пересев перед прогоном: сценарии теперь пишут в базу, и без него
     второй запуск идёт по данным, оставленным первым. */
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    /* Русский браузер: язык интерфейса выбирается по Accept-Language,
       и без этого Chromium со своим en-US открывал бы портал по-английски,
       а сценарии ищут русские подписи (FR-181). */
    locale: 'ru-RU',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    env: {
      /* Письма в файловый ящик: сценарии входят по настоящей ссылке. */
      MAIL_PROVIDER: 'file',
      /* Справочник перечитывается на каждый запрос: сценарий правит статус
         в базе и тут же смотрит на портал — ждать время жизни снимка значит
         добавить в прогон паузы, которые ничего не проверяют. */
      CATALOG_TTL_MS: '0',
    },
    timeout: 60_000,
  },
})
