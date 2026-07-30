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
    /* Письма в файловый ящик: сценарии входят по настоящей ссылке. */
    env: { MAIL_PROVIDER: 'file' },
    timeout: 60_000,
  },
})
