/**
 * Единственный экземпляр Prisma на процесс.
 *
 * В dev-режиме Next.js перезагружает модули на каждое изменение, и без
 * этой привязки к глобальному объекту за час работы накапливается несколько
 * десятков пулов соединений, после чего Postgres отвечает «too many clients»
 * — на ровном месте и без единой строки нового кода.
 */

import { existsSync } from 'node:fs'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

function createClient(): PrismaClient {
  /* Next.js читает .env сам, а отдельно запущенные скрипты — сид, воркер,
     проверка схемы — нет. Читаем здесь: иначе каждый такой скрипт обязан
     сделать это раньше своих импортов, а порядок импортов не тот порядок,
     на который стоит полагаться. */
  if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env')

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL не задан. Скопируйте .env.example в .env и поднимите базу: pnpm db:up',
    )
  }
  /* Prisma 7 работает через драйвер-адаптер: query compiler включён
     по умолчанию и собственного драйвера у клиента больше нет. */
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
