/**
 * Типы обращений. ФОРК ПРАВИТ ЭТОТ ФАЙЛ.
 *
 * Тип — не тег, а сущность, определяющая форму, набор статусов, видимость
 * и правила ленты (05-bug-intake.md, раздел 1).
 *
 * Ключевое правило шаблона: различия в поведении типов описываются полями здесь,
 * а не условиями `if (type === 'bug')` в коде (03-architecture.md, правило 4).
 */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'url'
  | 'environment'
  | 'attachments'

export interface FormField {
  name: string
  label: string
  kind: FieldKind
  required: boolean
  /** Подсказка под полем. Объясняет, зачем поле нужно, а не повторяет заголовок. */
  hint?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  maxLength?: number
}

export type Privacy = 'public' | 'reporter_team' | 'team_only'

export interface PostTypeConfig {
  key: string
  name: string
  /** Одна строка для экрана выбора типа — что именно сюда писать. */
  description: string
  /** Форма типа: набор полей, обязательность, подсказки (FR-502). */
  formSchema: FormField[]
  /** Какие статусы допустимы для этого типа (FR-503). */
  allowedStatusKeys: string[]
  defaultStatusKey: string
  defaultPrivacy: Privacy
  allowsVotes: boolean
  /** «Мне тоже нужно» vs «У меня тоже»: один голос значит разное. */
  voteLabel: string
  /** Слово для счётчика: голоса у идей, затронутые у багов. */
  countLabel: [string, string, string]
  /** Для багов trending бессмысленен (FR-504). */
  defaultSort: 'trending' | 'new' | 'affected'
  /** `question` в бэклог не попадает (FR-507). */
  goesToBacklog: boolean
  /** Не попадает в публичную ленту вовсе. */
  publicFeed: boolean
  enabled: boolean
}

const SEVERITY_OPTIONS = [
  { value: 'blocker', label: 'Блокирует работу' },
  { value: 'major', label: 'Мешает, есть обходной путь' },
  { value: 'minor', label: 'Косметика' },
]

const FREQUENCY_OPTIONS = [
  { value: 'always', label: 'Всегда' },
  { value: 'sometimes', label: 'Иногда' },
  { value: 'once', label: 'Один раз' },
]

export const postTypes: PostTypeConfig[] = [
  {
    key: 'idea',
    name: 'Идея',
    description: 'Чего не хватает в продукте или что стоит сделать удобнее.',
    formSchema: [
      {
        name: 'title',
        label: 'Коротко о чём речь',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Например: копировать неделю на месяц вперёд',
      },
      {
        name: 'details',
        label: 'Что вы хотите делать и почему сейчас не получается',
        kind: 'textarea',
        required: true,
        hint: 'Задача важнее решения: опишите, что мешает, а не только как это починить.',
      },
      { name: 'attachments', label: 'Вложения', kind: 'attachments', required: false },
    ],
    allowedStatusKeys: [
      'open',
      'planned',
      'building',
      'completed',
      'duplicate',
      'wont-fix',
    ],
    defaultStatusKey: 'open',
    defaultPrivacy: 'public',
    allowsVotes: true,
    voteLabel: 'Мне тоже нужно',
    countLabel: ['голос', 'голоса', 'голосов'],
    defaultSort: 'trending',
    goesToBacklog: true,
    publicFeed: true,
    enabled: true,
  },
  {
    key: 'bug',
    name: 'Баг',
    description: 'Что-то работает не так, как должно.',
    formSchema: [
      {
        name: 'title',
        label: 'Коротко о чём речь',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Например: экспорт теряет ночные смены',
      },
      {
        name: 'actual',
        label: 'Что произошло',
        kind: 'textarea',
        required: true,
      },
      {
        name: 'expected',
        label: 'Что вы ожидали',
        kind: 'textarea',
        required: true,
        hint: 'Отдельное поле, потому что в одном «описании» ожидаемое поведение не пишет никто.',
      },
      {
        name: 'steps',
        label: 'Шаги воспроизведения',
        kind: 'textarea',
        required: true,
        placeholder: '1. Открыть график\n2. Выбрать месяц\n3. Нажать «Экспорт»',
      },
      {
        name: 'frequency',
        label: 'Как часто повторяется',
        kind: 'select',
        required: true,
        options: FREQUENCY_OPTIONS,
      },
      {
        name: 'severity',
        label: 'Насколько мешает',
        kind: 'select',
        required: true,
        options: SEVERITY_OPTIONS,
        hint: 'Это ваша оценка. Приоритет работ команда ставит отдельно.',
      },
      {
        name: 'startedAt',
        label: 'Когда началось',
        kind: 'text',
        required: false,
        hint: 'Отделяет регрессию от «всегда так было».',
      },
      {
        name: 'environment',
        label: 'Окружение',
        kind: 'environment',
        required: false,
        hint: 'Заполняется автоматически. Проверьте и поправьте, если нужно.',
      },
      {
        name: 'attachments',
        label: 'Скриншот, видео или лог',
        kind: 'attachments',
        required: false,
      },
    ],
    allowedStatusKeys: [
      'open',
      'needs-info',
      'planned',
      'building',
      'completed',
      'not-reproducible',
      'duplicate',
      'wont-fix',
    ],
    defaultStatusKey: 'open',
    /* Заголовок и статус публичны, описание и диагностика — только репортеру
       и команде (FR-561). */
    defaultPrivacy: 'reporter_team',
    allowsVotes: true,
    voteLabel: 'У меня тоже',
    countLabel: ['затронут', 'затронуты', 'затронуто'],
    defaultSort: 'affected',
    goesToBacklog: true,
    publicFeed: true,
    enabled: true,
  },
  {
    key: 'question',
    name: 'Вопрос',
    description: 'Не получается разобраться, как что-то работает.',
    formSchema: [
      { name: 'title', label: 'Ваш вопрос', kind: 'text', required: true, maxLength: 120 },
      { name: 'details', label: 'Подробности', kind: 'textarea', required: false },
    ],
    allowedStatusKeys: ['open', 'needs-info', 'completed'],
    defaultStatusKey: 'open',
    defaultPrivacy: 'reporter_team',
    allowsVotes: false,
    voteLabel: '',
    countLabel: ['', '', ''],
    defaultSort: 'new',
    /* Смешивать вопросы с фидбэком — верный способ утопить и то и другое (FR-507). */
    goesToBacklog: false,
    publicFeed: false,
    enabled: true,
  },
]

export const enabledPostTypes = postTypes.filter((t) => t.enabled)

export const postTypeByKey = new Map(postTypes.map((t) => [t.key, t]))
