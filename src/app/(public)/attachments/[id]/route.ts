import { NextResponse } from 'next/server'

import { decideAccess } from '@/core/domain/intake/attachments'
import { isStaff } from '@/core/permissions'
import { getViewer } from '@/core/session'
import { getObject } from '@/core/storage'

/**
 * Отдача вложения (FR-561).
 *
 * Файл выдаёт приложение, а не хранилище: публичный бакет не умеет отличить
 * команду от постороннего, а вложения бага по умолчанию `team_only` — на
 * скриншоте чужие имена и номера заказов.
 *
 * Права проверяются на каждом запросе, а не один раз при выдаче ссылки.
 * Ссылка, пересланная в чат, у постороннего не откроется — и это ровно то,
 * ради чего отдача идёт через приложение.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const viewer = await getViewer()

  const access = await decideAccess(id, {
    signedIn: viewer.signedIn,
    id: viewer.id,
    isStaff: isStaff(viewer),
  })

  /* Постороннему «нет доступа» и «нет такого файла» отвечаются одинаково:
     разница между ними подсказывает, что файл существует. */
  if (access.decision !== 'allow' || !access.storageKey) {
    return new NextResponse('Файл недоступен', { status: 404 })
  }

  const body = await getObject(access.storageKey)
  if (!body) {
    /* Строка есть, файла нет: retention удалил объект, а строку не успел,
       либо хранилище потеряло его. Для смотрящего это одно и то же. */
    return new NextResponse('Файл недоступен', { status: 404 })
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': access.mime ?? 'application/octet-stream',
      /* Скачивать, а не исполнять в браузере: HTML или SVG из вложения,
         открытые с домена портала, — это XSS на своём же адресе. */
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      /* Приватное не кэшируется общими прокси: право проверяется на каждом
         запросе, и кэш посередине это правило обошёл бы. */
      'Cache-Control': 'private, max-age=60',
    },
  })
}
