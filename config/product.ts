/**
 * Конфигурация продукта. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Все различия между продуктами — данные, а не код (03-architecture.md, правило 4).
 * Ветвлений вида `if (product === 'foo')` в шаблоне быть не должно.
 *
 * Фичефлаги вместо удаления (правило 5): продукту не нужен changelog —
 * `features.changelog = false`, а не «вырезали страницу в форке».
 */

export type BoardVisibility = 'public' | 'private' | 'readonly'

export interface BoardConfig {
  /** Стабильный ключ и часть URL. Не меняется после первого деплоя. */
  slug: string
  name: string
  description: string
  visibility: BoardVisibility
  /** Порядок в навигации. */
  position: number
  /** Видна по прямой ссылке, но не в навигации (FR-104). */
  hiddenFromNav?: boolean
  /** Категория обязательна при создании обращения (FR-121). */
  requireCategory?: boolean
}

export interface ProductConfig {
  /** Название продукта. Выводится в шапке и в темах писем. */
  name: string
  /** Короткая буква/аббревиатура для знака в шапке. */
  mark: string
  /** Домен портала без протокола — для canonical, OpenGraph и sitemap. */
  domain: string
  /** Язык по умолчанию. Влияет и на словарь конфигурации Postgres для поиска. */
  locale: 'ru' | 'en'
  boards: BoardConfig[]
  features: {
    roadmap: boolean
    changelog: boolean
    /** Публичный список голосующих на обращении (FR-133). */
    voterList: boolean
    /** Приём багов отдельным типом обращения. */
    bugIntake: boolean
  }
  limits: {
    /** Не более N обращений в сутки с аккаунта (FR-126). */
    postsPerDay: number
    /** Не более M в час. */
    postsPerHour: number
    /** Размер страницы ленты. */
    feedPageSize: number
  }
  /**
   * Сколько ждать ответа автора на «нужна информация» (FR-533).
   *
   * Терпение у продуктов разное: у портала для внутренней команды неделя —
   * норма, у массового сервиса обращение без ответа через три дня
   * уже мёртвое. Поэтому сроки здесь, а не в коде.
   */
  needsInfo: {
    /** Через сколько дней напомнить автору. */
    remindAfterDays: number
    /** Через сколько дней закрыть, считая от запроса информации. */
    closeAfterDays: number
  }
  /** Период полураспада голоса в днях для trending (02-data-model.md). */
  trendingHalfLifeDays: number
}

export const product: ProductConfig = {
  name: 'Ритмика',
  mark: 'Р',
  domain: 'ritmika.app',
  locale: 'ru',
  boards: [
    {
      slug: 'product',
      name: 'Продукт',
      description:
        'Запросы функций и предложения по основному приложению: смены, шаблоны, права.',
      visibility: 'public',
      position: 1,
    },
    {
      slug: 'bugs',
      name: 'Ошибки',
      description:
        'Сообщения о том, что работает не так. Диагностика и вложения видны только команде.',
      visibility: 'public',
      position: 2,
    },
    {
      slug: 'reports',
      name: 'Отчёты и экспорт',
      description: 'Выгрузки, сводки по часам, интеграции с бухгалтерией.',
      visibility: 'public',
      position: 3,
    },
    {
      slug: 'enterprise',
      name: 'Корпоративные клиенты',
      description:
        'Доска для компаний на платном тарифе: интеграции, SLA, требования безопасности.',
      visibility: 'private',
      position: 4,
    },
  ],
  features: {
    roadmap: true,
    changelog: true,
    voterList: true,
    bugIntake: true,
  },
  limits: {
    postsPerDay: 5,
    postsPerHour: 2,
    feedPageSize: 12,
  },
  needsInfo: {
    remindAfterDays: 5,
    /* Считается от даты запроса информации, а не от напоминания: у автора
       десять дней всего, и напоминание на пятый — не новый отсчёт. */
    closeAfterDays: 10,
  },
  trendingHalfLifeDays: 21,
}
