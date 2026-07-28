/**
 * Управление людьми: роли и блокировка (FR-204, FR-232).
 *
 * Здесь живут правила, которые нельзя обойти интерфейсом, потому что
 * последствия у них необратимые или почти: снятый последний владелец —
 * это портал, в котором больше некому раздавать права.
 */

import { prisma } from '@/core/db'
import {
  can,
  canGrant,
  outranks,
  type AccessRole,
  type Principal,
} from '@/core/permissions'

export interface PersonRow {
  id: string
  name: string
  email: string
  role: string
  accessRole: AccessRole
  isTeam: boolean
  banned: boolean
  banReason: string | null
  posts: number
  createdAt: Date
}

/**
 * Список людей с поиском.
 *
 * Сортировка не по алфавиту, а по роли и дате: администратору нужно видеть,
 * у кого есть права, — а не искать двух сотрудников среди двух тысяч
 * участников.
 */
export async function listPeople(search = '', limit = 50): Promise<PersonRow[]> {
  const query = search.trim()
  const rows = await prisma.appUser.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: [{ accessRole: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accessRole: true,
      isTeam: true,
      bannedAt: true,
      banReason: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    accessRole: r.accessRole,
    isTeam: r.isTeam,
    banned: r.bannedAt !== null,
    banReason: r.banReason,
    posts: r._count.posts,
    createdAt: r.createdAt,
  }))
}

export type ManageOutcome =
  | { ok: true }
  | {
      ok: false
      reason: 'not-found' | 'forbidden' | 'reason-required' | 'last-owner' | 'self'
    }

/**
 * Назначить роль.
 *
 * Три запрета, и каждый закрывает свой способ остаться без управления:
 * нельзя выдать роль выше своей, нельзя менять роль самому себе (иначе
 * администратор случайно разжалует себя и потеряет доступ), нельзя снять
 * последнего владельца.
 */
export async function setAccessRole(
  actor: Principal & { id: string },
  userId: string,
  role: AccessRole,
): Promise<ManageOutcome> {
  if (!canGrant(actor, role)) return { ok: false, reason: 'forbidden' }
  if (actor.id === userId) return { ok: false, reason: 'self' }

  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { accessRole: true },
  })
  if (!user) return { ok: false, reason: 'not-found' }
  /* Понизить того, кто выше тебя, тоже нельзя: иначе администратор снимает
     владельца и занимает его место. Равного — можно: владелец вправе
     разжаловать владельца, пока остаётся хотя бы один. */
  if (!canGrant(actor, user.accessRole)) return { ok: false, reason: 'forbidden' }

  if (user.accessRole === 'owner' && role !== 'owner') {
    const owners = await prisma.appUser.count({ where: { accessRole: 'owner' } })
    if (owners <= 1) return { ok: false, reason: 'last-owner' }
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: {
      accessRole: role,
      /* Признак команды идёт следом за ролью: он определяет пометку
         в треде, и сотрудник без неё выглядит посторонним. */
      isTeam: role !== 'user',
      /* Роль выдают тому, кому доверяют: держать его в очереди модерации
         после этого бессмысленно. */
      ...(role !== 'user' ? { trusted: true } : {}),
    },
  })
  return { ok: true }
}

/**
 * Заблокировать (FR-204).
 *
 * Причина обязательна: она показывается самому заблокированному, и без неё
 * блокировка неотличима от поломки портала.
 */
export async function banPerson(
  actor: Principal & { id: string },
  userId: string,
  reason: string,
): Promise<ManageOutcome> {
  const text = reason.trim()
  if (text.length < 3) return { ok: false, reason: 'reason-required' }
  if (actor.id === userId) return { ok: false, reason: 'self' }

  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { accessRole: true },
  })
  if (!user) return { ok: false, reason: 'not-found' }
  if (!can(actor, 'user.ban')) return { ok: false, reason: 'forbidden' }
  /* Заблокировать равного или старшего нельзя: иначе двое администраторов
     блокируют друг друга наперегонки, и кто успел — тот и прав. */
  if (!outranks(actor, user.accessRole)) return { ok: false, reason: 'forbidden' }

  await prisma.$transaction([
    prisma.appUser.update({
      where: { id: userId },
      data: { bannedAt: new Date(), banReason: text },
    }),
    /* Сессии прекращаются сразу. Блокировка, которая начнёт действовать
       через месяц, когда истечёт cookie, — это не блокировка. */
    prisma.session.deleteMany({ where: { userId } }),
  ])
  return { ok: true }
}

export async function unbanPerson(
  actor: Principal & { id: string },
  userId: string,
): Promise<ManageOutcome> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { accessRole: true },
  })
  if (!user) return { ok: false, reason: 'not-found' }
  if (!can(actor, 'user.ban')) return { ok: false, reason: 'forbidden' }
  if (!outranks(actor, user.accessRole)) return { ok: false, reason: 'forbidden' }

  await prisma.appUser.update({
    where: { id: userId },
    data: { bannedAt: null, banReason: null },
  })
  return { ok: true }
}
