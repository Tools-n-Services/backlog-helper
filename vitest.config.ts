import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    /* Пересев перед прогоном: часть тестов сравнивает выдачу с фикстурами,
       часть — создаёт обращения. Известное состояние нужно и тем и другим. */
    globalSetup: ['./vitest.globalSetup.ts'],
    /* Тесты паритета ходят в одну базу: параллельные файлы мешали бы
       друг другу состоянием. */
    fileParallelism: false,
  },
})
