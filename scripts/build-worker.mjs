/**
 * Сборка воркера в один файл (В6, docs/09-install.md).
 *
 * В образе нет ни tsx, ни исходников: приложение едет самодостаточной
 * сборкой Next, а воркер — отдельным процессом, которому та сборка не годится.
 * Поэтому он собирается в один файл со всеми зависимостями внутри.
 *
 * Это возможно только потому, что Prisma здесь работает через драйверный
 * адаптер (`@prisma/adapter-pg`), то есть без бинарного движка: иначе
 * пришлось бы тащить в образ ещё и его, следя за версией и платформой.
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['scripts/worker.ts'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  platform: 'node',
  /* ESM, а не CommonJS: сгенерированный клиент Prisma читает `import.meta.url`,
     и в CommonJS-выводе оно становится пустым — падает не на сборке, а при
     запуске контейнера. */
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  /* Драйвер `pg` собран как CommonJS и требует модули по имени в рантайме.
     В ESM-выводе такого `require` нет, поэтому объявляем его сами — иначе
     первое же соединение с базой падает на «Dynamic require of events». */
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module'",
      'const require = __createRequire(import.meta.url)',
    ].join('\n'),
  },
  /* Пакеты с нативной частью не бандлим: их бинарники всё равно нужны
     на диске, и подмена путей внутри бандла ломает их загрузку. */
  external: ['pg-native'],
  logLevel: 'info',
})
