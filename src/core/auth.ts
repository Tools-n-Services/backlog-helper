/**
 * Вход по одноразовой ссылке (FR-171, FR-172).
 *
 * Пароля нет намеренно: портал обратной связи — не то место, где человек
 * заведёт ещё один пароль. Нет пароля — нечего утекать, нечего подбирать,
 * не нужен сброс.
 *
 * Что здесь важно и почему:
 *
 *   токены хранятся хешами — дамп таблицы не даёт войти ни под кем;
 *   токен одноразовый и с коротким сроком — перехваченная ссылка из письма
 *     не работает вечно;
 *   сессия лежит в базе, а не в подписанном JWT — её нужно уметь прекратить
 *     (выход, бан, смена прав), а токен об этом узнать не может;
 *   сравнение хешей — по времени постоянное, чтобы по задержке ответа нельзя
 *     было подбирать токен посимвольно;
 *   ответ на запрос ссылки одинаков для существующего и несуществующего
 *     адреса — иначе форма входа превращается в проверялку «есть ли у вас
 *     аккаунт на этом портале».
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { prisma } from '@/core/db'

export const SESSION_COOKIE = 'bh_session'

/** Срок жизни ссылки входа. Достаточно, чтобы дойти до почты, и не более. */
const LINK_TTL_MINUTES = 15

/** Срок сессии. Продлевается при обращении, см. `getSessionUser`. */
const SESSION_TTL_DAYS = 30

/** Не больше стольких ссылок на адрес за час: письмо — тоже ресурс. */
const LINKS_PER_HOUR = 5

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Сравнение хешей за постоянное время. Обычное `===` завершается на первом
 * различающемся байте, и по времени ответа токен подбирается посимвольно.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function newToken(): string {
  /* 32 байта из криптографического источника: угадать перебором нельзя. */
  return randomBytes(32).toString('base64url')
}

export type SignInResult =
  | { ok: true; token: string; email: string }
  | { ok: false; reason: 'invalid-email' | 'rate-limited' }

/**
 * Выдаёт ссылку входа.
 *
 * Пользователь заводится при первом входе: отдельной регистрации нет —
 * лишний шаг между «хочу написать» и «написал» стоит дороже, чем кажется.
 */
export async function requestSignInLink(rawEmail: string): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, reason: 'invalid-email' }
  }

  const hourAgo = new Date(Date.now() - 3_600_000)
  const recent = await prisma.verificationToken.count({
    where: { email, createdAt: { gte: hourAgo } },
  })
  if (recent >= LINKS_PER_HOUR) return { ok: false, reason: 'rate-limited' }

  const token = newToken()
  await prisma.verificationToken.create({
    data: {
      email,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60_000),
    },
  })

  return { ok: true, token, email }
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' }

/**
 * Проверяет токен из ссылки и открывает сессию.
 *
 * Заблокированному аккаунту вход НЕ запрещён: читать портал ему можно,
 * а нельзя писать и голосовать — это проверяется на действиях (FR-204).
 * Не пустить его внутрь значило бы показать форму входа вместо объяснения,
 * что произошло, и человек так и не узнает, за что.
 *
 * Токен гасится в той же транзакции, что и создание сессии: между проверкой
 * и гашением не должно быть окна, в котором двойной клик по ссылке из письма
 * даёт две сессии.
 */
export async function consumeSignInLink(token: string): Promise<ConsumeResult> {
  if (!token) return { ok: false, reason: 'invalid' }

  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hash(token) },
  })
  if (!record) return { ok: false, reason: 'invalid' }
  if (record.consumedAt) return { ok: false, reason: 'used' }
  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' }

  const sessionToken = newToken()

  const result = await prisma.$transaction(async (tx) => {
    /* Гасим по условию consumed_at is null: если параллельный запрос успел
       раньше, обновится ноль строк, и вторая сессия не откроется. */
    const consumed = await tx.verificationToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (consumed.count === 0) return null

    const user = await tx.appUser.upsert({
      where: { email: record.email },
      update: {},
      create: {
        email: record.email,
        /* Имя человек назовёт сам в профиле: спрашивать его на входе —
           ещё одно поле между желанием написать и написанным. */
        name: record.email.split('@')[0] ?? 'Участник',
        role: 'пользователь портала',
      },
    })

    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: hash(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000),
      },
    })

    return { userId: user.id }
  })

  if (result === null) return { ok: false, reason: 'used' }

  await setSessionCookie(sessionToken)
  return { ok: true, userId: result.userId }
}

async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  })
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  isTeam: boolean
  accessRole: 'user' | 'moderator' | 'admin' | 'owner'
  banned: boolean
  bannedReason: string | null
  createdAt: Date
}

/** Текущий пользователь по cookie, либо null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isTeam: true,
          accessRole: true,
          bannedAt: true,
          banReason: true,
          createdAt: true,
        },
      },
    },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    /* Истёкшую убираем сразу, а не ждём джобу: строка бесполезна. */
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const user = session.user
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isTeam: user.isTeam,
    accessRole: user.accessRole,
    /* Забаненный не теряет сессию: читать портал ему можно, писать — нет
       (FR-204). Разлогинить его значило бы показать экран входа вместо
       объяснения, что произошло. */
    banned: user.bannedAt !== null,
    bannedReason: user.banReason,
    createdAt: user.createdAt,
  }
}

/** Закрывает текущую сессию. */
export async function signOut(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hash(token) } })
  }
  store.delete(SESSION_COOKIE)
}

/** Ссылка, которая уходит в письме. */
export function signInUrl(token: string, origin: string): string {
  return `${origin}/login/verify?token=${encodeURIComponent(token)}`
}
