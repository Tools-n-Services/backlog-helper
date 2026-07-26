import { cookies } from 'next/headers'

/**
 * Текущий пользователь.
 *
 * ЗАГЛУШКА ФАЗЫ A: роль берётся из cookie, которую переключает виджет внизу
 * страницы. Он нужен не для удобства — без него нельзя показать состояния
 * «не авторизован» и «аккаунт заблокирован», а они обязательны к проектированию
 * (07-ui-brief.md, раздел 5).
 *
 * В итерации B2 всё это заменит Auth.js. Меняется реализация `getViewer()`,
 * не её сигнатура и не вызывающий код.
 */

export type ViewerRole = 'guest' | 'user' | 'team' | 'banned'

export interface Viewer {
  role: ViewerRole
  signedIn: boolean
  id: string
  name: string
  email: string
  initials: string
  /** Сотрудник команды: видит внутренние комментарии и действия триажа. */
  isTeam: boolean
  /** Читать портал можно, создавать и голосовать — нет (FR-204). */
  banned: boolean
  bannedReason: string | null
  memberSince: string
}

export const VIEWER_COOKIE = 'viewer-role'

const VIEWERS: Record<ViewerRole, Viewer> = {
  guest: {
    role: 'guest',
    signedIn: false,
    id: '',
    name: '',
    email: '',
    initials: '',
    isTeam: false,
    banned: false,
    bannedReason: null,
    memberSince: '',
  },
  user: {
    role: 'user',
    signedIn: true,
    id: 'user-demo',
    name: 'Елена Сорокина',
    email: 'e.sorokina@ritmika.app',
    initials: 'ЕС',
    isTeam: false,
    banned: false,
    bannedReason: null,
    memberSince: 'с апреля 2025',
  },
  team: {
    role: 'team',
    signedIn: true,
    id: 'user-team',
    name: 'Игорь Ремизов',
    email: 'i.remizov@ritmika.app',
    initials: 'ИР',
    isTeam: true,
    banned: false,
    bannedReason: null,
    memberSince: 'с января 2024',
  },
  banned: {
    role: 'banned',
    signedIn: true,
    id: 'user-banned',
    name: 'Дмитрий Кравцов',
    email: 'd.kravtsov@example.com',
    initials: 'ДК',
    isTeam: false,
    banned: true,
    bannedReason: '14 обращений с одинаковым текстом за сутки',
    memberSince: 'с марта 2026',
  },
}

function isRole(value: string | undefined): value is ViewerRole {
  return value === 'guest' || value === 'user' || value === 'team' || value === 'banned'
}

export async function getViewer(): Promise<Viewer> {
  const role = (await cookies()).get(VIEWER_COOKIE)?.value
  return VIEWERS[isRole(role) ? role : 'user']
}

/** Может ли пользователь голосовать, писать и комментировать. */
export function canContribute(viewer: Viewer): boolean {
  return viewer.signedIn && !viewer.banned
}
