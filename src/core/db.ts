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
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      /* Часовой пояс соединения — строго UTC.
       *
       * Драйвер отправляет момент времени без указания смещения, и Postgres
       * трактует его в часовом поясе сессии. На машине в Москве приложение
       * записывает 16:06Z, а в базу ложится 13:06Z. Обратно значение читается
       * с тем же смещением, поэтому приложение расхождения не видит вовсе —
       * зато всё, что сравнивает время ВНУТРИ SQL, ошибается ровно на смещение
       * пояса: возраст голоса, просроченность SLA, срок ожидания ответа.
       *
       * Найдено пересчётом trend_score: он расходился с той же формулой
       * на 0.6%, и это оказались три часа. */
      options: '-c timezone=UTC',
    }),
  })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
