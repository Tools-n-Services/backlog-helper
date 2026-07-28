/**
 * Текущий пользователь.
 *
 * Единственный источник — сессия из базы (`src/core/auth.ts`). Ни ролей
 * из cookie, ни подстановки пользователя для удобства разработки: всё,
 * что не настоящий вход, рано или поздно оказывается способом обойти
 * проверку прав.
 */

import { getSessionUser } from '@/core/auth'
import type { AccessRole } from '@/core/permissions'

export interface Viewer {
  signedIn: boolean
  id: string
  name: string
  email: string
  initials: string
  /**
   * Сотрудник команды продукта — признак ПРИНАДЛЕЖНОСТИ, а не полномочий:
   * им помечаются комментарии в треде (FR-137). Право на действие даёт
   * `accessRole`, и путать эти две вещи нельзя: приглашённый в команду
   * стажёр помечается как команда, но триаж ему не открывают.
   */
  isTeam: boolean
  /** Полномочия (FR-232). Проверяются через `core/permissions.ts`. */
  accessRole: AccessRole
  /** Читать портал можно, создавать и голосовать — нет (FR-204). */
  banned: boolean
  bannedReason: string | null
  memberSince: string
}

export const GUEST: Viewer = {
  signedIn: false,
  id: '',
  name: '',
  email: '',
  initials: '',
  isTeam: false,
  accessRole: 'user',
  banned: false,
  bannedReason: null,
  memberSince: '',
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function memberSince(at: Date): string {
  /* Форматируем с днём и отбрасываем его: без дня Intl отдаёт месяц
     в именительном падеже — «с июль 2026». С днём получается родительный,
     который и нужен: «с июля 2026». */
  const full = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at)
  return `с ${full.replace(/^\d+\s+/, '').replace(' г.', '')}`
}

export async function getViewer(): Promise<Viewer> {
  const user = await getSessionUser()
  if (!user) return GUEST

  return {
    signedIn: true,
    id: user.id,
    name: user.name,
    email: user.email,
    initials: initialsOf(user.name),
    isTeam: user.isTeam,
    accessRole: user.accessRole,
    banned: user.banned,
    bannedReason: user.bannedReason,
    memberSince: memberSince(user.createdAt),
  }
}

/** Может ли пользователь голосовать, писать и комментировать. */
export function canContribute(viewer: Viewer): boolean {
  return viewer.signedIn && !viewer.banned
}
