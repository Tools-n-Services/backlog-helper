/**
 * Автосбор окружения для багрепорта (FR-511).
 *
 * Ручной ввод версии браузера не работает никогда — человек его не знает
 * и не должен знать. Поля собираются сами и показываются свёрнутыми
 * с возможностью поправить.
 *
 * Здесь только то, что доступно веб-форме. Полная диагностика — версия сборки,
 * ошибки консоли, сетевые 4xx/5xx, breadcrumbs — приходит из виджета-сборщика
 * (FR-513).
 */

export interface EnvironmentInfo {
  browser: string
  os: string
  screen: string
  locale: string
  timezone: string
}

export const ENVIRONMENT_LABELS: Record<keyof EnvironmentInfo, string> = {
  browser: 'Браузер',
  os: 'Система',
  screen: 'Экран',
  locale: 'Язык',
  timezone: 'Часовой пояс',
}

function detectBrowser(ua: string): string {
  const rules: [RegExp, string][] = [
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ]
  for (const [pattern, name] of rules) {
    const match = ua.match(pattern)
    if (match) return `${name} ${match[1]?.split('.')[0] ?? ''}`.trim()
  }
  return 'неизвестен'
}

function detectOs(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10 или 11'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X ([\d_]+)/.test(ua)) {
    return `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim()
  }
  if (/Android ([\d.]+)/.test(ua)) return `Android ${ua.match(/Android ([\d.]+)/)?.[1]}`
  if (/iPhone|iPad/.test(ua)) return 'iOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'неизвестна'
}

/** Вызывается только в браузере: на сервере этих данных нет и быть не должно. */
export function collectEnvironment(): EnvironmentInfo {
  const ua = navigator.userAgent
  return {
    browser: detectBrowser(ua),
    os: detectOs(ua),
    screen: `${window.screen.width}×${window.screen.height}`,
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

export function environmentToText(info: Partial<EnvironmentInfo>): string {
  return (Object.keys(ENVIRONMENT_LABELS) as (keyof EnvironmentInfo)[])
    .filter((key) => info[key])
    .map((key) => `${ENVIRONMENT_LABELS[key]}: ${info[key]}`)
    .join('\n')
}
