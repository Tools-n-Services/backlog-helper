/**
 * Текущий пользователь.
 *
 * ЗАГЛУШКА ФАЗЫ A. В итерации A5 сюда приедет переключатель «гость / пользователь
 * / команда», чтобы можно было показывать состояния «не авторизован». В итерации
 * B2 всё это заменит Auth.js, а сигнатура `getViewer()` останется прежней.
 */

export interface Viewer {
  signedIn: boolean
  id: string
  name: string
  initials: string
  /** Сотрудник команды продукта: видит внутренние комментарии и действия триажа. */
  isTeam: boolean
}

const GUEST: Viewer = {
  signedIn: false,
  id: '',
  name: '',
  initials: '',
  isTeam: false,
}

const DEMO_USER: Viewer = {
  signedIn: true,
  id: 'user-demo',
  name: 'Мария Ковалёва',
  initials: 'МК',
  isTeam: false,
}

export function getViewer(): Viewer {
  return DEMO_USER
}

export { GUEST }
