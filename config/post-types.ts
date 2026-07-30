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
  options?: { value: string; label: string; labelEn?: string }[]
  maxLength?: number
  /**
   * Английские подписи (FR-181). Необязательны: у форка с одним языком
   * их нет, и заставлять заполнять оба поля — работа ради ничего.
   */
  labelEn?: string
  hintEn?: string
  placeholderEn?: string
}

export type Privacy = 'public' | 'reporter_team' | 'team_only'

export interface PostTypeConfig {
  key: string
  name: string
  /** Название на английском (FR-181). Пусто — показываем основное. */
  nameEn?: string
  /** Одна строка для экрана выбора типа — что именно сюда писать. */
  description: string
  descriptionEn?: string
  /**
   * Заголовок карточки на экране выбора типа: «Что-то работает не так».
   * Здесь, а не в коде экрана: иначе новый тип форка требует правки switch
   * по ключу типа — ровно того ветвления, которого шаблон избегает.
   */
  chooserTitle: string
  chooserTitleEn?: string
  /** Продолжение заголовка формы: «Расскажите, что сломалось». */
  prompt: string
  promptEn?: string
  /** Форма типа: набор полей, обязательность, подсказки (FR-502). */
  formSchema: FormField[]
  /** Какие статусы допустимы для этого типа (FR-503). */
  allowedStatusKeys: string[]
  defaultStatusKey: string
  defaultPrivacy: Privacy
  allowsVotes: boolean
  /** «Мне тоже нужно» vs «У меня тоже»: один голос значит разное. */
  voteLabel: string
  /** То же по-английски (FR-181). Пусто — портал одноязычный. */
  voteLabelEn?: string
  /** Слово для счётчика: голоса у идей, затронутые у багов. */
  countLabel: [string, string, string]
  /** Английские формы: у английского их две, третья дублирует вторую. */
  countLabelEn?: [string, string, string]
  /** Для багов trending бессмысленен (FR-504). */
  defaultSort: 'trending' | 'new' | 'affected'
  /** `question` в бэклог не попадает (FR-507). */
  goesToBacklog: boolean
  /** Не попадает в публичную ленту вовсе. */
  publicFeed: boolean
  enabled: boolean
}

const SEVERITY_OPTIONS = [
  { value: 'blocker', label: 'Блокирует работу', labelEn: 'Blocks my work' },
  { value: 'major', label: 'Мешает, есть обходной путь', labelEn: 'Painful, but there is a workaround' },
  { value: 'minor', label: 'Косметика', labelEn: 'Cosmetic' },
]

const FREQUENCY_OPTIONS = [
  { value: 'always', label: 'Всегда', labelEn: 'Always' },
  { value: 'sometimes', label: 'Иногда', labelEn: 'Sometimes' },
  { value: 'once', label: 'Один раз', labelEn: 'Once' },
]

export const postTypes: PostTypeConfig[] = [
  {
    key: 'idea',
    chooserTitle: 'Хочу предложить идею',
    chooserTitleEn: 'I have an idea',
    prompt: 'что предлагаете',
    promptEn: 'what you suggest',
    name: 'Идея',
    nameEn: 'Idea',
    description: 'Чего не хватает в продукте или что стоит сделать удобнее.',
    descriptionEn: 'What the product is missing, or what could be made easier.',
    formSchema: [
      {
        name: 'title',
        label: 'Коротко о чём речь',
        labelEn: 'In short, what is this about',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Например: копировать неделю на месяц вперёд',
        placeholderEn: 'For example: copy a week a month ahead',
      },
      {
        name: 'details',
        label: 'Что вы хотите делать и почему сейчас не получается',
        labelEn: 'What you want to do and why it does not work now',
        kind: 'textarea',
        required: true,
        hint: 'Задача важнее решения: опишите, что мешает, а не только как это починить.',
        hintEn: 'The problem matters more than the solution: describe what gets in the way, not only how to fix it.',
      },
      {
        name: 'attachments',
        label: 'Вложения',
        labelEn: 'Attachments',
        kind: 'attachments',
        required: false,
      },
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
    voteLabelEn: 'I need this too',
    countLabel: ['голос', 'голоса', 'голосов'],
    countLabelEn: ['vote', 'votes', 'votes'],
    defaultSort: 'trending',
    goesToBacklog: true,
    publicFeed: true,
    enabled: true,
  },
  {
    key: 'bug',
    chooserTitle: 'Что-то работает не так',
    chooserTitleEn: 'Something works the wrong way',
    prompt: 'что сломалось',
    promptEn: 'what broke',
    name: 'Баг',
    nameEn: 'Bug',
    description: 'Что-то работает не так, как должно.',
    descriptionEn: 'Something works the wrong way.',
    formSchema: [
      {
        name: 'title',
        label: 'Коротко о чём речь',
        labelEn: 'In short, what is this about',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Например: экспорт теряет ночные смены',
        placeholderEn: 'For example: the export loses night shifts',
      },
      {
        name: 'actual',
        label: 'Что произошло',
        labelEn: 'What happened',
        kind: 'textarea',
        required: true,
      },
      {
        name: 'expected',
        label: 'Что вы ожидали',
        labelEn: 'What you expected',
        kind: 'textarea',
        required: true,
        hint: 'Отдельное поле, потому что в одном «описании» ожидаемое поведение не пишет никто.',
        hintEn: 'A separate field, because nobody writes the expected behaviour inside a single “description”.',
      },
      {
        name: 'steps',
        label: 'Шаги воспроизведения',
        labelEn: 'Steps to reproduce',
        kind: 'textarea',
        required: true,
        placeholder: '1. Открыть график\n2. Выбрать месяц\n3. Нажать «Экспорт»',
        placeholderEn: '1. Open the schedule\n2. Pick a month\n3. Press “Export”',
      },
      {
        name: 'frequency',
        label: 'Как часто повторяется',
        labelEn: 'How often it happens',
        kind: 'select',
        required: true,
        options: FREQUENCY_OPTIONS,
      },
      {
        name: 'severity',
        label: 'Насколько мешает',
        labelEn: 'How much it gets in the way',
        kind: 'select',
        required: true,
        options: SEVERITY_OPTIONS,
        hint: 'Это ваша оценка. Приоритет работ команда ставит отдельно.',
        hintEn: 'This is your assessment. The team sets work priority separately.',
      },
      {
        name: 'startedAt',
        label: 'Когда началось',
        labelEn: 'When it started',
        kind: 'text',
        required: false,
        hint: 'Отделяет регрессию от «всегда так было».',
        hintEn: 'Separates a regression from “it was always like that”.',
      },
      {
        name: 'environment',
        label: 'Окружение',
        labelEn: 'Environment',
        kind: 'environment',
        required: false,
        hint: 'Заполняется автоматически. Проверьте и поправьте, если нужно.',
        hintEn: 'Filled in automatically. Check it and correct it if needed.',
      },
      {
        name: 'attachments',
        label: 'Скриншот, видео или лог',
        labelEn: 'Screenshot, video or log',
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
    voteLabelEn: 'Same here',
    countLabel: ['затронут', 'затронуты', 'затронуто'],
    countLabelEn: ['affected', 'affected', 'affected'],
    defaultSort: 'affected',
    goesToBacklog: true,
    publicFeed: true,
    enabled: true,
  },
  {
    key: 'question',
    chooserTitle: 'Не понимаю, как сделать',
    chooserTitleEn: 'I cannot work out how',
    prompt: 'что не получается',
    promptEn: 'what does not work out',
    name: 'Вопрос',
    nameEn: 'Question',
    description: 'Не получается разобраться, как что-то работает.',
    descriptionEn: 'You cannot work out how something works.',
    formSchema: [
      {
        name: 'title',
        label: 'Ваш вопрос',
        labelEn: 'Your question',
        kind: 'text',
        required: true,
        maxLength: 120,
      },
      {
        name: 'details',
        label: 'Подробности',
        labelEn: 'Details',
        kind: 'textarea',
        required: false,
      },
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
