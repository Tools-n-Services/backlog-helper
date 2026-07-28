/**
 * Конфигурация Prisma CLI. С седьмой версии connection string задаётся здесь,
 * а не в schema.prisma.
 *
 * Адрес базы — обычный DATABASE_URL и ничего больше: локально он указывает
 * на кластер из .data/pg (pnpm db:up), в проде — на управляемый Postgres.
 * Миграции, схема и код приложения при этом одни и те же.
 */

import { existsSync } from 'node:fs'

import { defineConfig, env } from 'prisma/config'

/* Prisma 7 больше не читает .env сам, а Next.js делает это только для
   приложения. Штатный загрузчик Node — чтобы не тащить dotenv ради одной
   переменной. */
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
