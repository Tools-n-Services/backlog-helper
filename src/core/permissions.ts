/**
 * Полномочия (FR-232).
 *
 * До этого модуля право на действие сводилось к «сотрудник или нет», и три
 * разные роли в базе — модератор, администратор, владелец — ничем не
 * отличались друг от друга. Разница между ними не косметическая: модератор
 * разбирает обращения, но не должен раздавать права, а снять права
 * последнему владельцу не должен никто.
 *
 * Роли складываются по возрастанию: каждая следующая умеет всё, что
 * предыдущая. Это сознательное упрощение вместо матрицы разрешений —
 * матрица нужна, когда полномочия пересекаются, а здесь они вложены.
 */

export type AccessRole = 'user' | 'moderator' | 'admin' | 'owner'

const RANK: Record<AccessRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
}

export const ACCESS_ROLES: { key: AccessRole; name: string; hint: string }[] = [
  { key: 'user', name: 'Пользователь', hint: 'Читает, голосует, пишет обращения' },
  { key: 'moderator', name: 'Модератор', hint: 'Плюс модерация и решения триажа' },
  { key: 'admin', name: 'Администратор', hint: 'Плюс объединение и управление людьми' },
  { key: 'owner', name: 'Владелец', hint: 'Плюс назначение администраторов' },
]

export const accessRoleName = (role: AccessRole): string =>
  ACCESS_ROLES.find((r) => r.key === role)?.name ?? role

/** Полномочия, которые проверяются в коде. */
export type Permission =
  /** Видеть внутренние поверхности и внутренние комментарии. */
  | 'team.view'
  /** Принимать решения по обращениям и менять публичный статус. */
  | 'triage.decide'
  /** Одобрять и отклонять обращения из очереди модерации (FR-201). */
  | 'moderation.review'
  /** Объединять обращения (FR-211) — операция, которую трудно откатить. */
  | 'post.merge'
  /** Блокировать и разблокировать людей (FR-204). */
  | 'user.ban'
  /** Назначать роли. */
  | 'user.role'

const REQUIRED: Record<Permission, AccessRole> = {
  'team.view': 'moderator',
  'triage.decide': 'moderator',
  'moderation.review': 'moderator',
  /* Объединение переносит голоса и комментарии и практически необратимо
     без журнала — это уровень администратора, а не дежурного модератора. */
  'post.merge': 'admin',
  'user.ban': 'admin',
  /* Раздача прав — только владелец: администратор, способный назначить
     себе владельца, делает роль владельца бессмысленной. */
  'user.role': 'owner',
}

export interface Principal {
  signedIn: boolean
  accessRole: AccessRole
  banned: boolean
}

/**
 * Может ли этот человек сделать это.
 *
 * Заблокированный не может ничего, независимо от роли: блокировка
 * администратора обязана его останавливать, иначе она бессмысленна.
 */
export function can(principal: Principal, permission: Permission): boolean {
  if (!principal.signedIn || principal.banned) return false
  return RANK[principal.accessRole] >= RANK[REQUIRED[permission]]
}

/** Сотрудник команды: видит внутренние поверхности. */
export function isStaff(principal: Principal): boolean {
  return can(principal, 'team.view')
}

/**
 * Можно ли выдать эту роль.
 *
 * Выдать роль выше своей нельзя — иначе повышение до владельца доступно
 * любому, кто уже что-то может.
 */
export function canGrant(principal: Principal, role: AccessRole): boolean {
  return can(principal, 'user.role') && RANK[role] <= RANK[principal.accessRole]
}

/**
 * Старше ли этот человек того, у кого такая роль.
 *
 * Отдельно от полномочий, потому что отвечает на другой вопрос: право
 * блокировать даёт роль администратора, а вот заблокировать другого
 * администратора нельзя — иначе двое блокируют друг друга наперегонки,
 * и портал остаётся без управления за минуту.
 */
export function outranks(principal: Principal, role: AccessRole): boolean {
  return RANK[principal.accessRole] > RANK[role]
}
