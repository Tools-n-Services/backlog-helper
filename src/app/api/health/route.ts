import { NextResponse } from 'next/server'

import { prisma } from '@/core/db'

/**
 * Проверка живости для балансировщика и compose (В6, docs/09-install.md).
 *
 * Отвечает только при доступной базе: контейнер, который поднялся, но
 * не видит базу, обязан считаться нездоровым — иначе балансировщик пошлёт
 * в него трафик, и человек получит не «сервис поднимается», а ошибку.
 *
 * Никаких подробностей наружу: версия, имя базы и текст ошибки драйвера —
 * это разведданные, а проверке живости достаточно кода ответа.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
