/**
 * Демонстрационные данные продукта-примера. ФОРК ЗАМЕНЯЕТ ЭТОТ ФАЙЛ ЦЕЛИКОМ
 * или удаляет его, если портал стартует с пустой базой.
 *
 * Содержимое разворачивается в записи детерминированно: одни и те же входные
 * данные дают одни и те же даты голосов и комментариев в любом запуске.
 * Благодаря этому пересев не меняет порядок ленты, и тесты, которые
 * проверяют сортировку и счётчики, остаются осмысленными.
 *
 * Контент осмысленный, а не lorem: на нём проверяется, что лента читается,
 * заголовки переносятся, а фильтры дают правдоподобные счётчики.
 *
 * Продукт-пример — «Ритмика», планирование смен и графиков.
 */

import { slugify } from '@/core/slug'

export interface PostSeed {
  boardSlug: 'product' | 'bugs' | 'reports'
  typeKey: 'idea' | 'bug' | 'question'
  categorySlug: string
  statusKey: string
  title: string
  excerpt: string
  /** Базовое число голосов (у багов — уникальных затронутых). */
  votes: number
  comments: number
  /** Возраст обращения в днях. */
  ageDays: number
  /** Доля голосов, набранных за последние две недели: 0 — старый, 1 — вспыхнул. */
  recency: number
  pinned?: boolean
  teamReply?: boolean
  awaitingReporter?: boolean
}

export const categories: Record<string, { slug: string; name: string }[]> = {
  product: [
    { slug: 'shifts', name: 'Смены' },
    { slug: 'templates', name: 'Шаблоны' },
    { slug: 'roles', name: 'Права и роли' },
    { slug: 'notifications', name: 'Уведомления' },
    { slug: 'mobile', name: 'Мобильное приложение' },
  ],
  bugs: [
    { slug: 'shifts', name: 'Смены' },
    { slug: 'export', name: 'Экспорт' },
    { slug: 'roles', name: 'Права и роли' },
    { slug: 'sync', name: 'Синхронизация' },
    { slug: 'mobile', name: 'Мобильное приложение' },
  ],
  reports: [
    { slug: 'excel', name: 'Excel' },
    { slug: 'hours', name: 'Сводки по часам' },
    { slug: 'integrations', name: 'Интеграции' },
    { slug: 'print', name: 'Печать' },
  ],
}

export const postSeeds: PostSeed[] = [
  // ── Продукт · идеи ────────────────────────────────────────────────────
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'templates',
    statusKey: 'planned',
    title: 'Массовое копирование недели на месяц вперёд',
    excerpt:
      'Сейчас неделю приходится копировать по одной. Нужна возможность размножить шаблон сразу на четыре недели с учётом праздников.',
    votes: 1842,
    comments: 128,
    ageDays: 240,
    recency: 0.35,
    pinned: true,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'shifts',
    statusKey: 'building',
    title: 'Автоподбор замены при отмене смены',
    excerpt:
      'Когда сотрудник снимается со смены, руководитель ищет замену вручную по чату. Хочется список тех, кто свободен и уложится в норму часов.',
    votes: 1204,
    comments: 96,
    ageDays: 180,
    recency: 0.5,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'shifts',
    statusKey: 'open',
    title: 'Учёт переработок с предупреждением до публикации графика',
    excerpt:
      'График публикуется, и только потом выясняется, что у трёх человек перебор по часам. Проверка нужна до публикации, а не после.',
    votes: 876,
    comments: 54,
    ageDays: 90,
    recency: 0.7,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'mobile',
    statusKey: 'open',
    title: 'Обмен сменами между сотрудниками без участия руководителя',
    excerpt:
      'Двое договорились сами — пусть меняются в приложении, а руководитель только подтверждает одним касанием.',
    votes: 743,
    comments: 61,
    ageDays: 120,
    recency: 0.62,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'notifications',
    statusKey: 'planned',
    title: 'Напоминание о смене за час, а не только накануне',
    excerpt:
      'Вечернее уведомление теряется. Нужно короткое напоминание прямо перед выходом, с адресом точки.',
    votes: 612,
    comments: 33,
    ageDays: 150,
    recency: 0.3,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'roles',
    statusKey: 'open',
    title: 'Роль «старший смены» с правом двигать только свой день',
    excerpt:
      'Между сотрудником и управляющим не хватает промежуточной роли: подвинуть людей внутри своей смены, но не трогать месяц.',
    votes: 528,
    comments: 41,
    ageDays: 75,
    recency: 0.55,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'templates',
    statusKey: 'completed',
    title: 'Шаблоны графика под сезон',
    excerpt:
      'Летом и в декабре расписание другое. Хочется хранить несколько именованных шаблонов и переключаться между ними.',
    votes: 495,
    comments: 27,
    ageDays: 400,
    recency: 0.05,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'shifts',
    statusKey: 'open',
    title: 'Отметка «не ставить в ночь» в карточке сотрудника',
    excerpt:
      'У части людей есть медицинские ограничения. Сейчас это держится в голове у управляющего и теряется при его отпуске.',
    votes: 431,
    comments: 22,
    ageDays: 60,
    recency: 0.68,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'notifications',
    statusKey: 'open',
    title: 'Дайджест изменений графика раз в день вместо письма на каждую правку',
    excerpt:
      'При перестроении недели приходит двадцать писем. Люди отписываются и потом не видят важное.',
    votes: 388,
    comments: 35,
    ageDays: 45,
    recency: 0.8,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'mobile',
    statusKey: 'building',
    title: 'Офлайн-доступ к своему графику',
    excerpt:
      'На складе нет связи. Достаточно показывать последний загруженный график с пометкой, когда он обновлялся.',
    votes: 356,
    comments: 19,
    ageDays: 200,
    recency: 0.25,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'roles',
    statusKey: 'wont-fix',
    title: 'Полный доступ к чужим филиалам для региональных менеджеров',
    excerpt:
      'Хочется видеть графики всех точек региона и править их напрямую.',
    votes: 214,
    comments: 48,
    ageDays: 320,
    recency: 0.08,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'shifts',
    statusKey: 'planned',
    title: 'Перетаскивание смены сразу на нескольких сотрудников',
    excerpt:
      'При сдвиге открытия точки на час нужно подвинуть всю смену целиком, а не каждого по очереди.',
    votes: 302,
    comments: 16,
    ageDays: 110,
    recency: 0.4,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'templates',
    statusKey: 'open',
    title: 'Учёт производственного календаря при копировании',
    excerpt:
      'Праздники и переносы приходится править руками после каждого копирования недели.',
    votes: 287,
    comments: 14,
    ageDays: 38,
    recency: 0.85,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'mobile',
    statusKey: 'open',
    title: 'Виджет ближайшей смены на экране блокировки',
    excerpt: 'Чтобы посмотреть время начала, не открывая приложение.',
    votes: 241,
    comments: 9,
    ageDays: 55,
    recency: 0.6,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'notifications',
    statusKey: 'open',
    title: 'Уведомление руководителю, если смена осталась непокрытой за сутки',
    excerpt:
      'Дыры в графике обнаруживаются утром того же дня, когда искать замену уже поздно.',
    votes: 198,
    comments: 12,
    ageDays: 28,
    recency: 0.9,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'roles',
    statusKey: 'duplicate',
    title: 'Ограничить редактирование графика после публикации',
    excerpt: 'После публикации график должен закрываться на правки без согласования.',
    votes: 156,
    comments: 7,
    ageDays: 130,
    recency: 0.2,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'shifts',
    statusKey: 'open',
    title: 'Разные нормы часов для совместителей',
    excerpt:
      'Норма зашита одна на всех, из-за чего совместители всегда подсвечиваются как недоработавшие.',
    votes: 134,
    comments: 11,
    ageDays: 20,
    recency: 0.95,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'templates',
    statusKey: 'open',
    title: 'История версий графика с возможностью откатить',
    excerpt:
      'После неудачного массового изменения восстановить прошлый вариант можно только вручную.',
    votes: 121,
    comments: 8,
    ageDays: 15,
    recency: 1,
  },
  {
    boardSlug: 'product',
    typeKey: 'idea',
    categorySlug: 'notifications',
    statusKey: 'completed',
    title: 'Уведомления в Telegram вместо SMS',
    excerpt: 'SMS не доходят и стоят денег, а Telegram есть у всех.',
    votes: 402,
    comments: 24,
    ageDays: 520,
    recency: 0.03,
    teamReply: true,
  },
  {
    boardSlug: 'product',
    typeKey: 'question',
    categorySlug: 'roles',
    statusKey: 'needs-info',
    title: 'Как передать права управляющего на время отпуска',
    excerpt: 'Не нашёл в настройках временную передачу прав.',
    votes: 0,
    comments: 3,
    ageDays: 9,
    recency: 0,
    awaitingReporter: true,
  },

  // ── Ошибки ────────────────────────────────────────────────────────────
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'export',
    statusKey: 'building',
    title: 'Экспорт графика в Excel теряет ночные смены',
    excerpt:
      'Смена с 22:00 до 06:00 попадает в выгрузку одним днём, из-за чего в отчёте по часам расходится итог за месяц.',
    votes: 214,
    comments: 31,
    ageDays: 34,
    recency: 0.75,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'roles',
    statusKey: 'needs-info',
    title: 'Менеджер филиала видит смены соседнего филиала',
    excerpt:
      'После смены роли в правах остаётся доступ к чужому расписанию. Нужны шаги воспроизведения и роль до изменения.',
    votes: 76,
    comments: 4,
    ageDays: 12,
    recency: 0.9,
    awaitingReporter: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'sync',
    statusKey: 'open',
    title: 'Смена, удалённая с телефона, возвращается после синхронизации',
    excerpt:
      'Удаляю смену в приложении, через несколько минут она снова появляется в графике на вебе.',
    votes: 143,
    comments: 22,
    ageDays: 18,
    recency: 0.95,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'shifts',
    statusKey: 'planned',
    title: 'Перевод часов ломает длительность смены на сутки вперёд',
    excerpt:
      'В ночь перехода на зимнее время смена считается на час длиннее, и это тянется в табель.',
    votes: 89,
    comments: 17,
    ageDays: 65,
    recency: 0.3,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'mobile',
    statusKey: 'open',
    title: 'Приложение выкидывает из аккаунта при смене сети',
    excerpt:
      'При переходе с Wi-Fi на мобильный интернет открывается экран входа, график до повторного входа недоступен.',
    votes: 167,
    comments: 28,
    ageDays: 22,
    recency: 0.88,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'export',
    statusKey: 'completed',
    title: 'В выгрузке пропадают сотрудники без смен в периоде',
    excerpt:
      'Человек в отпуске весь месяц просто отсутствует в файле, из-за чего бухгалтерия считает его уволенным.',
    votes: 112,
    comments: 15,
    ageDays: 160,
    recency: 0.05,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'shifts',
    statusKey: 'not-reproducible',
    title: 'Смена иногда не сохраняется без сообщения об ошибке',
    excerpt:
      'Нажимаю «Сохранить», окно закрывается, но смена не появляется. Повторить не удалось.',
    votes: 58,
    comments: 19,
    ageDays: 95,
    recency: 0.12,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'sync',
    statusKey: 'open',
    title: 'Двойные смены после одновременного редактирования',
    excerpt:
      'Если управляющий и старший смены правят один день, обе версии сохраняются и человек стоит дважды.',
    votes: 94,
    comments: 13,
    ageDays: 11,
    recency: 1,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'roles',
    statusKey: 'open',
    title: 'Уволенный сотрудник продолжает получать уведомления о сменах',
    excerpt: 'Карточка закрыта две недели назад, письма продолжают приходить.',
    votes: 71,
    comments: 6,
    ageDays: 16,
    recency: 0.92,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'mobile',
    statusKey: 'building',
    title: 'На маленьких экранах не видно кнопку подтверждения смены',
    excerpt: 'Кнопка уезжает за нижний край, прокрутка в диалоге не работает.',
    votes: 63,
    comments: 9,
    ageDays: 48,
    recency: 0.42,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'shifts',
    statusKey: 'duplicate',
    title: 'Ночная смена отображается в неправильном дне недели',
    excerpt: 'В недельном виде смена с 23:00 стоит на следующий день.',
    votes: 46,
    comments: 5,
    ageDays: 40,
    recency: 0.5,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'export',
    statusKey: 'open',
    title: 'Кириллица в именах файлов превращается в вопросительные знаки',
    excerpt: 'Скачанный файл называется набором символов, приходится переименовывать вручную.',
    votes: 38,
    comments: 4,
    ageDays: 7,
    recency: 1,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'sync',
    statusKey: 'wont-fix',
    title: 'График не обновляется в фоновом режиме на старых Android',
    excerpt: 'На Android 8 приложение перестаёт обновлять данные, пока не открыть его вручную.',
    votes: 27,
    comments: 8,
    ageDays: 210,
    recency: 0.04,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'shifts',
    statusKey: 'open',
    title: 'Копирование недели дублирует отпуска',
    excerpt:
      'При копировании недели с отпуском отпуск проставляется второй раз поверх существующего.',
    votes: 52,
    comments: 7,
    ageDays: 9,
    recency: 1,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'mobile',
    statusKey: 'needs-info',
    title: 'Push о смене приходит с задержкой в несколько часов',
    excerpt: 'Уведомление о завтрашней смене приходит ночью. Нужна модель телефона и версия ОС.',
    votes: 41,
    comments: 6,
    ageDays: 14,
    recency: 0.85,
    awaitingReporter: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'roles',
    statusKey: 'completed',
    title: 'Права не применяются до перезахода в аккаунт',
    excerpt: 'После изменения роли пользователь до перелогина работает со старыми правами.',
    votes: 84,
    comments: 11,
    ageDays: 190,
    recency: 0.03,
    teamReply: true,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'export',
    statusKey: 'open',
    title: 'Выгрузка за большой период обрывается на середине',
    excerpt: 'При выборе года файл скачивается неполным, ошибки при этом нет.',
    votes: 33,
    comments: 5,
    ageDays: 5,
    recency: 1,
  },
  {
    boardSlug: 'bugs',
    typeKey: 'bug',
    categorySlug: 'sync',
    statusKey: 'not-reproducible',
    title: 'Изменения пропадают при быстром переключении между филиалами',
    excerpt: 'Правки в одном филиале иногда не сохраняются, если сразу перейти в другой.',
    votes: 29,
    comments: 12,
    ageDays: 72,
    recency: 0.15,
    teamReply: true,
  },

  // ── Отчёты и экспорт ──────────────────────────────────────────────────
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'hours',
    statusKey: 'planned',
    title: 'Сводка по часам с разбивкой на дневные, ночные и праздничные',
    excerpt:
      'Бухгалтерия считает надбавки вручную, потому что в отчёте только общий итог за месяц.',
    votes: 634,
    comments: 44,
    ageDays: 140,
    recency: 0.45,
    teamReply: true,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'integrations',
    statusKey: 'open',
    title: 'Выгрузка табеля напрямую в 1С',
    excerpt:
      'Сейчас файл выгружается, правится и загружается руками. На двадцати точках это полдня работы.',
    votes: 521,
    comments: 38,
    ageDays: 100,
    recency: 0.6,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'excel',
    statusKey: 'building',
    title: 'Настраиваемый набор колонок в выгрузке',
    excerpt:
      'Каждому подразделению нужен свой набор полей, а сейчас файл один на всех и половину колонок удаляют.',
    votes: 387,
    comments: 21,
    ageDays: 170,
    recency: 0.3,
    teamReply: true,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'hours',
    statusKey: 'open',
    title: 'Сравнение план/факт по часам за период',
    excerpt: 'Хочется видеть, где регулярно расходится запланированное и отработанное.',
    votes: 298,
    comments: 17,
    ageDays: 50,
    recency: 0.72,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'print',
    statusKey: 'open',
    title: 'Печатная версия графика на неделю для доски объявлений',
    excerpt:
      'График вешают на стену. Сейчас печатается со скроллом и не помещается на A4.',
    votes: 246,
    comments: 13,
    ageDays: 30,
    recency: 0.88,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'integrations',
    statusKey: 'planned',
    title: 'Регулярная выгрузка по расписанию на почту',
    excerpt: 'Каждое первое число кто-то должен вручную скачать и разослать отчёт.',
    votes: 213,
    comments: 10,
    ageDays: 85,
    recency: 0.5,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'excel',
    statusKey: 'completed',
    title: 'Выгрузка сразу по нескольким филиалам одним файлом',
    excerpt: 'Раньше приходилось скачивать по одному и склеивать.',
    votes: 341,
    comments: 19,
    ageDays: 300,
    recency: 0.04,
    teamReply: true,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'hours',
    statusKey: 'open',
    title: 'Отчёт по переработкам с порогом предупреждения',
    excerpt: 'Нужен список тех, кто приближается к лимиту, а не факт постфактум.',
    votes: 176,
    comments: 9,
    ageDays: 24,
    recency: 0.93,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'print',
    statusKey: 'wont-fix',
    title: 'Экспорт графика в виде картинки для мессенджера',
    excerpt: 'Отправлять скриншот в рабочий чат удобнее, чем ссылку.',
    votes: 92,
    comments: 15,
    ageDays: 260,
    recency: 0.06,
    teamReply: true,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'integrations',
    statusKey: 'open',
    title: 'Вебхук о публикации графика',
    excerpt: 'Хотим сами уведомлять сотрудников через свою рассылку.',
    votes: 68,
    comments: 6,
    ageDays: 13,
    recency: 1,
  },
  {
    boardSlug: 'reports',
    typeKey: 'idea',
    categorySlug: 'excel',
    statusKey: 'open',
    title: 'Сохранение параметров отчёта как именованного пресета',
    excerpt: 'Одни и те же фильтры выставляются заново при каждой выгрузке.',
    votes: 154,
    comments: 8,
    ageDays: 42,
    recency: 0.65,
  },
  {
    boardSlug: 'reports',
    typeKey: 'bug',
    categorySlug: 'excel',
    statusKey: 'open',
    title: 'Итог по часам в файле не сходится с итогом на экране',
    excerpt:
      'Расхождение появляется на месяцах с переносами праздников: на экране одно число, в файле другое.',
    votes: 87,
    comments: 14,
    ageDays: 19,
    recency: 0.9,
  },
  {
    boardSlug: 'reports',
    typeKey: 'bug',
    categorySlug: 'print',
    statusKey: 'open',
    title: 'При печати обрезается последний столбец недели',
    excerpt: 'Воскресенье не помещается и уезжает на вторую страницу пустым.',
    votes: 44,
    comments: 5,
    ageDays: 8,
    recency: 1,
  },
  {
    boardSlug: 'reports',
    typeKey: 'question',
    categorySlug: 'integrations',
    statusKey: 'completed',
    title: 'В каком формате отдаётся табель для внешней системы',
    excerpt: 'Нужно описание колонок выгрузки для интеграции на нашей стороне.',
    votes: 0,
    comments: 2,
    ageDays: 35,
    recency: 0,
    teamReply: true,
  },
]

// ── Люди, обсуждения и объединения ──────────────────────────────────────

export interface Person {
  name: string
  /** Подпись под именем: должность и масштаб — она объясняет вес мнения. */
  role: string
  /** Сотрудник команды продукта: его комментарии помечаются отдельно (FR-137). */
  team?: boolean
}

export const people: Person[] = [
  { name: 'Елена Сорокина', role: 'управляющая сетью · 4 филиала' },
  { name: 'Дмитрий Кравцов', role: 'старший смены' },
  { name: 'Анна Логинова', role: 'HR-директор · 60 сотрудников' },
  { name: 'Тимур Валиев', role: 'управляющий филиалом' },
  { name: 'Наталья Панкратова', role: 'бухгалтер по расчёту' },
  { name: 'Сергей Хомяков', role: 'директор по операциям' },
  { name: 'Ольга Дементьева', role: 'администратор точки' },
  { name: 'Павел Рыжов', role: 'региональный менеджер · 12 точек' },
  { name: 'Марина Кузьмина', role: 'координатор смен' },
  { name: 'Игорь Ремизов', role: 'продукт-менеджер', team: true },
  { name: 'Алина Ковалёва', role: 'поддержка', team: true },
]

export interface CommentSeed {
  /** Индекс в `people`. */
  author: number
  agoDays: number
  body: string
  likes: number
  pinned?: boolean
  replies?: CommentSeed[]
}

/**
 * Написанные вручную треды для показательных обращений. Остальные собираются
 * из общего пула ниже: сотня уникальных обсуждений демонстрации не нужна,
 * а один настоящий — нужен, иначе не видно, как читается тред.
 */
export const commentThreads: Record<string, CommentSeed[]> = {
  'Экспорт графика в Excel теряет ночные смены': [
    {
      author: 9,
      agoDays: 3,
      pinned: true,
      likes: 12,
      body: 'Подтверждаем: ошибка в правиле разбивки смены по датам при экспорте. Исправление в работе, выйдет в релизе 2.31 — ориентировочно 5 мая. В интерфейсе и в отчёте внутри продукта данные корректны, расходится только выгрузка.',
      replies: [
        {
          author: 1,
          agoDays: 2,
          likes: 3,
          body: 'У нас та же история с выгрузкой в 1С — там ночная смена тоже съезжает. Возможно, общее правило разбивки.',
        },
        {
          author: 9,
          agoDays: 2,
          likes: 0,
          body: 'Да, правило общее. Выгрузка в 1С починится тем же релизом — отдельное обращение создавать не нужно.',
        },
      ],
    },
    {
      author: 4,
      agoDays: 6,
      likes: 5,
      body: 'Расхождение у нас вышло 6–8 часов на человека за месяц. Пересчитывали табель вручную по каждому ночному сотруднику.',
    },
    {
      author: 3,
      agoDays: 9,
      likes: 2,
      body: 'Воспроизводится на любом филиале, где есть смена через полночь. На дневных сменах всё сходится.',
    },
  ],
  'Массовое копирование недели на месяц вперёд': [
    {
      author: 9,
      agoDays: 21,
      pinned: true,
      likes: 34,
      body: 'Взяли в работу. Делаем в два шага: сначала копирование недели на выбранный период, затем — учёт производственного календаря. Второй шаг поедет отдельным релизом, чтобы не задерживать первый.',
    },
    {
      author: 2,
      agoDays: 40,
      likes: 18,
      body: 'Каждый месяц уходит день на то, чтобы разложить один и тот же шаблон по неделям. Это самая частая жалоба от управляющих.',
    },
    {
      author: 7,
      agoDays: 55,
      likes: 9,
      body: 'Важно, чтобы при копировании не затирались уже проставленные отпуска и больничные. Сейчас при ручном копировании это регулярно происходит.',
      replies: [
        {
          author: 9,
          agoDays: 54,
          likes: 4,
          body: 'Учтём: отпуска и отсутствия при копировании перезаписываться не будут.',
        },
      ],
    },
  ],
  'Менеджер филиала видит смены соседнего филиала': [
    {
      author: 10,
      agoDays: 10,
      pinned: true,
      likes: 2,
      body: 'Спасибо за сообщение. Чтобы воспроизвести, нужны две вещи: какая роль была у сотрудника до изменения и через сколько времени после смены роли остался доступ. Пока не удаётся повторить на тестовом стенде.',
    },
  ],
}

/** Пул реплик для остальных обращений: достаточно правдоподобно, чтобы читать. */
export const genericComments: string[] = [
  'Поддерживаю. У нас это отнимает несколько часов в месяц на каждой точке.',
  'Столкнулись с тем же самым на прошлой неделе. Обходимся ручной правкой.',
  'Было бы полезно, но важнее сначала закрыть историю с правами доступа.',
  'А есть понимание по срокам? Готовы протестировать на своём филиале.',
  'У нас сеть из 14 точек, и без этого планирование занимает целый день.',
  'Проверил у себя — воспроизводится стабильно, не разово.',
  'Похожая проблема была в прошлом году, тогда починили. Кажется, вернулось.',
  'Главное, чтобы это не сломало существующие шаблоны. У нас их около тридцати.',
  'Готовы поучаствовать в тестировании, если нужны реальные данные.',
  'Обходной путь есть, но он требует выгружать данные и править вручную.',
  'Для нас это блокирует переход с прошлой системы.',
  'Присоединяюсь, у нас та же боль в филиалах с ночными сменами.',
]

export interface MergedSeed {
  title: string
  movedVotes: number
}

/** Смерженные дубликаты: показываются секцией «Объединённые обращения» (FR-141). */
export const mergedInto: Record<string, MergedSeed[]> = {
  'Экспорт графика в Excel теряет ночные смены': [
    { title: 'Ночные смены в выгрузке за месяц считаются дважды', movedVotes: 47 },
    { title: 'Excel: часы после полуночи не переносятся', movedVotes: 12 },
  ],
  'Массовое копирование недели на месяц вперёд': [
    { title: 'Копировать график сразу на квартал', movedVotes: 96 },
    { title: 'Размножить шаблон недели на месяц', movedVotes: 61 },
    { title: 'Дублирование расписания на несколько недель', movedVotes: 28 },
  ],
  'Выгрузка табеля напрямую в 1С': [{ title: 'Интеграция с 1С:ЗУП', movedVotes: 74 }],
}

/**
 * Развёрнутые тела показательных обращений. Для остальных тело собирается
 * из краткого описания и общего второго абзаца.
 */
export const postDetails: Record<string, string[]> = {
  'Экспорт графика в Excel теряет ночные смены': [
    'Смена с 22:00 до 06:00 попадает в выгрузку одним днём — часы после полуночи не переносятся на следующую дату. В отчёте по часам итог за месяц расходится с фактическим на 6–8 часов на каждого ночного сотрудника.',
    'Воспроизводится на любом филиале с ночными сменами. В интерфейсе смена показана верно, проблема только в выгрузке.',
  ],
  'Массовое копирование недели на месяц вперёд': [
    'Сейчас неделю приходится копировать по одной: выбрать неделю, скопировать, перейти на следующую, вставить. На месяц вперёд это восемь действий, и на каждом шаге легко ошибиться неделей.',
    'Нужна возможность размножить шаблон сразу на выбранный период — например, на четыре недели, — с учётом производственного календаря и без затирания уже проставленных отпусков.',
  ],
  'Автоподбор замены при отмене смены': [
    'Когда сотрудник снимается со смены, руководитель ищет замену вручную: пишет в общий чат и ждёт, кто откликнется. В выходные это занимает несколько часов, а иногда смена так и остаётся непокрытой.',
    'Хочется видеть список тех, кто в этот день свободен, укладывается в норму часов и имеет нужную квалификацию, — и отправить предложение в один клик.',
  ],
}

/** Второй абзац для сгенерированных тел: нейтральный, но не пустой. */
export const detailsTail =
  'Готовы показать на своих данных и ответить на вопросы, если понадобятся подробности.'

// ── Роадмап и changelog ─────────────────────────────────────────────────

/**
 * Сроки, названные командой (FR-134/FR-153). Заполнены не у всех: ETA
 * появляется, когда работа началась, — обещать раньше вредно.
 */
export const etaByTitle: Record<string, string> = {
  'Экспорт графика в Excel теряет ночные смены': 'релиз 2.31',
  'Автоподбор замены при отмене смены': 'релиз 2.32',
  'Офлайн-доступ к своему графику': 'релиз 2.33',
  'Настраиваемый набор колонок в выгрузке': 'релиз 2.32',
  'На маленьких экранах не видно кнопку подтверждения смены': 'релиз 2.31',
  'Массовое копирование недели на месяц вперёд': 'II квартал',
  'Напоминание о смене за час, а не только накануне': 'II квартал',
  'Перетаскивание смены сразу на нескольких сотрудников': 'III квартал',
  'Сводка по часам с разбивкой на дневные, ночные и праздничные': 'II квартал',
  'Регулярная выгрузка по расписанию на почту': 'III квартал',
  'Перевод часов ломает длительность смены на сутки вперёд': 'релиз 2.31',
}

export type ChangeKindSeed = 'new' | 'improved' | 'fixed'

export interface ChangeSeed {
  kind: ChangeKindSeed
  title: string
  body: string
}

export interface ChangelogSeed {
  slug: string
  version: string
  title: string
  lead: string
  /** Сколько дней назад создана. Для опубликованных — дата публикации. */
  agoDays: number
  /**
   * Ещё не опубликована: срок публикации через N дней (FR-166).
   *
   * Черновик со сроком лежит в демонстрационных данных намеренно. Без него
   * экран релизов пуст ровно там, где живёт главное действие продукта —
   * закрыть обращения и сказать людям, что вышло то, о чём они просили.
   */
  scheduledInDays?: number
  labels: string[]
  changes: ChangeSeed[]
  /** Заголовки обращений, закрытых этим релизом (FR-165). */
  closes: string[]
}

export const changelogSeeds: ChangelogSeed[] = [
  {
    slug: 'release-2-31',
    version: '2.31',
    title: 'Ночные смены в отчётах и мобильные подтверждения',
    lead:
      'Три исправления по обращениям, у которых стоял срок «релиз 2.31». Всем, кто их описал и проголосовал, уйдёт письмо в день публикации.',
    agoDays: 2,
    /* Дата уже названа снаружи — в ETA обращений стоит «релиз 2.31».
       Публикацию делает проход воркера, а не человек у ноутбука. */
    scheduledInDays: 3,
    labels: ['Отчёты', 'Мобильное приложение'],
    changes: [
      {
        kind: 'fixed',
        title: 'Ночные смены в выгрузке за месяц',
        body: 'Часы после полуночи снова относятся к дате начала смены. Выгрузки за прошлые периоды пересчитываются при следующем запросе.',
      },
      {
        kind: 'fixed',
        title: 'Перевод часов и длительность смены',
        body: 'Смена, попавшая на переход на зимнее или летнее время, считается по фактической длительности, а не по разнице во времени начала и конца.',
      },
      {
        kind: 'improved',
        title: 'Подтверждение смены на маленьких экранах',
        body: 'Кнопка подтверждения закреплена внизу экрана и не уезжает за границу на устройствах шириной от 320 точек.',
      },
    ],
    closes: [
      'Экспорт графика в Excel теряет ночные смены',
      'Перевод часов ломает длительность смены на сутки вперёд',
      'На маленьких экранах не видно кнопку подтверждения смены',
    ],
  },
  {
    slug: 'release-2-30',
    version: '2.30',
    title: 'Шаблоны недели и быстрая замена смены',
    lead: 'Два изменения, о которых просили чаще всего. Оба выросли из обращений на этом портале — спасибо всем, кто описал детали и проголосовал.',
    agoDays: 12,
    labels: ['Смены', 'Шаблоны'],
    changes: [
      {
        kind: 'new',
        title: 'Шаблоны недели',
        body: 'Сохраните типовую неделю один раз и применяйте её к любому периоду. Праздничные дни подставляются автоматически по производственному календарю, смены в них помечаются, чтобы их можно было пересобрать вручную.',
      },
      {
        kind: 'improved',
        title: 'Замена смены за два шага',
        body: 'Сотрудник предлагает замену из мобильного приложения, менеджер подтверждает одним нажатием прямо из уведомления. Раньше это занимало четыре шага и обязательный звонок.',
      },
      {
        kind: 'fixed',
        title: 'Отчёт по часам и отпуска без оплаты',
        body: 'Отпуск без сохранения зарплаты больше не попадает в отработанные часы. Отчёты за прошлые периоды пересчитаны автоматически.',
      },
    ],
    closes: ['Шаблоны графика под сезон', 'В выгрузке пропадают сотрудники без смен в периоде'],
  },
  {
    slug: 'release-2-29',
    version: '2.29',
    title: 'Отчёты по филиалам и права наставника',
    lead: 'Небольшой релиз про то, что мешало каждый день: сводные отчёты и доступы.',
    agoDays: 26,
    labels: ['Отчёты', 'Права'],
    changes: [
      {
        kind: 'improved',
        title: 'Отчёт сразу по нескольким филиалам',
        body: 'Раньше отчёт строился по одной точке, и сводку собирали в Excel руками. Теперь филиалы выбираются списком, итог считается общий и с разбивкой.',
      },
      {
        kind: 'fixed',
        title: 'Роль наставника и смены стажёра',
        body: 'Наставник снова видит смены закреплённого за ним стажёра. Ошибка появилась после переработки прав в 2.27.',
      },
    ],
    closes: ['Права не применяются до перезахода в аккаунт'],
  },
  {
    slug: 'release-2-28',
    version: '2.28',
    title: 'Уведомления в Telegram',
    lead: 'SMS доходили не всегда и стоили денег. Теперь уведомления можно получать в Telegram.',
    agoDays: 47,
    labels: ['Уведомления'],
    changes: [
      {
        kind: 'new',
        title: 'Бот уведомлений',
        body: 'Сотрудник привязывает Telegram один раз и получает напоминания о сменах, изменениях графика и запросах на замену. Канал выбирается в настройках уведомлений.',
      },
      {
        kind: 'improved',
        title: 'Меньше писем при перестроении недели',
        body: 'Правки, сделанные подряд, собираются в одно уведомление вместо письма на каждое изменение.',
      },
    ],
    closes: ['Уведомления в Telegram вместо SMS'],
  },
  {
    slug: 'release-2-27',
    version: '2.27',
    title: 'Переработка прав и ролей',
    lead: 'Роли стали гибче: между сотрудником и управляющим появился промежуточный уровень.',
    agoDays: 68,
    labels: ['Права'],
    changes: [
      {
        kind: 'new',
        title: 'Роль «старший смены»',
        body: 'Может двигать людей внутри своего дня, но не трогает месяц и не публикует график.',
      },
      {
        kind: 'fixed',
        title: 'Доступ уволенных сотрудников',
        body: 'После закрытия карточки доступ прекращается сразу, а не до конца сессии.',
      },
    ],
    closes: [],
  },
  {
    slug: 'release-2-26',
    version: '2.26',
    title: 'Мобильное приложение: офлайн и виджет',
    lead: 'На складах и в цехах связи нет — приложение перестало быть бесполезным без сети.',
    agoDays: 96,
    labels: ['Мобильное приложение'],
    changes: [
      {
        kind: 'new',
        title: 'Офлайн-режим',
        body: 'Последний загруженный график доступен без сети, с пометкой времени обновления.',
      },
      {
        kind: 'improved',
        title: 'Быстрее открывается расписание',
        body: 'Экран графика открывается за долю секунды вместо нескольких секунд на слабых устройствах.',
      },
      {
        kind: 'fixed',
        title: 'Выход из аккаунта при смене сети',
        body: 'Переключение между Wi-Fi и мобильным интернетом больше не разлогинивает.',
      },
    ],
    closes: [],
  },
  {
    slug: 'release-2-25',
    version: '2.25',
    title: 'Экспорт и сводки',
    lead: 'Выгрузки стали ближе к тому, что нужно бухгалтерии.',
    agoDays: 130,
    labels: ['Отчёты', 'Экспорт'],
    changes: [
      {
        kind: 'new',
        title: 'Выгрузка по нескольким филиалам',
        body: 'Один файл вместо десяти отдельных, склеиваемых вручную.',
      },
      {
        kind: 'fixed',
        title: 'Кодировка в выгрузке',
        body: 'Кириллица в заголовках столбцов больше не превращается в вопросительные знаки.',
      },
    ],
    closes: ['Выгрузка сразу по нескольким филиалам одним файлом'],
  },
]

// ── Триаж ───────────────────────────────────────────────────────────────

export type IntakeSourceKey = 'portal' | 'widget' | 'email' | 'api' | 'admin'

export const intakeSourceNames: Record<IntakeSourceKey, string> = {
  portal: 'портал',
  widget: 'виджет',
  email: 'почта',
  api: 'API',
  admin: 'вручную',
}

export interface TriageSeed {
  severity: 'blocker' | 'major' | 'minor'
  frequency: 'always' | 'sometimes' | 'once'
  source: IntakeSourceKey
  /** Сегмент репортера — вход в автооценку приоритета. */
  segment: 'enterprise' | 'paid' | 'free'
  /** Индекс в `people`; null — не назначено. */
  assignee?: number
  /** Команда уже ответила: SLA остановлен. */
  answered?: boolean
  /** Приоритет команды, если уже проставлен. */
  priority?: 'p0' | 'p1' | 'p2' | 'p3'
  /** Повтор ранее исправленного бага (FR-525). */
  regression?: boolean
}

/**
 * Данные триажа по обращениям: ложатся в колонки `post` — severity,
 * frequency, source_id, assignee_id, first_response_at.
 */
export const triageByTitle: Record<string, TriageSeed> = {
  'Экспорт графика в Excel теряет ночные смены': {
    severity: 'major', frequency: 'always', source: 'portal', segment: 'enterprise',
    assignee: 9, answered: true, priority: 'p1',
  },
  'Менеджер филиала видит смены соседнего филиала': {
    severity: 'blocker', frequency: 'sometimes', source: 'email', segment: 'enterprise',
    assignee: 10, answered: true, priority: 'p0',
  },
  'Смена, удалённая с телефона, возвращается после синхронизации': {
    severity: 'major', frequency: 'always', source: 'widget', segment: 'paid',
  },
  'Перевод часов ломает длительность смены на сутки вперёд': {
    severity: 'major', frequency: 'sometimes', source: 'portal', segment: 'paid',
    assignee: 9, answered: true, priority: 'p2', regression: true,
  },
  'Приложение выкидывает из аккаунта при смене сети': {
    severity: 'blocker', frequency: 'always', source: 'widget', segment: 'paid',
  },
  'В выгрузке пропадают сотрудники без смен в периоде': {
    severity: 'major', frequency: 'always', source: 'email', segment: 'enterprise',
    assignee: 9, answered: true, priority: 'p1',
  },
  'Смена иногда не сохраняется без сообщения об ошибке': {
    severity: 'blocker', frequency: 'once', source: 'portal', segment: 'free',
    assignee: 10, answered: true,
  },
  'Двойные смены после одновременного редактирования': {
    severity: 'blocker', frequency: 'sometimes', source: 'widget', segment: 'enterprise',
  },
  'Уволенный сотрудник продолжает получать уведомления о сменах': {
    severity: 'major', frequency: 'always', source: 'email', segment: 'paid',
  },
  'На маленьких экранах не видно кнопку подтверждения смены': {
    severity: 'major', frequency: 'always', source: 'widget', segment: 'free',
    assignee: 9, answered: true, priority: 'p2',
  },
  'Ночная смена отображается в неправильном дне недели': {
    severity: 'minor', frequency: 'always', source: 'portal', segment: 'free',
  },
  'Кириллица в именах файлов превращается в вопросительные знаки': {
    severity: 'minor', frequency: 'always', source: 'portal', segment: 'free',
  },
  'График не обновляется в фоновом режиме на старых Android': {
    severity: 'minor', frequency: 'sometimes', source: 'widget', segment: 'free',
    assignee: 9, answered: true, priority: 'p3',
  },
  'Копирование недели дублирует отпуска': {
    severity: 'major', frequency: 'always', source: 'portal', segment: 'enterprise',
  },
  'Push о смене приходит с задержкой в несколько часов': {
    severity: 'major', frequency: 'sometimes', source: 'widget', segment: 'paid',
    assignee: 10, answered: true,
  },
  'Права не применяются до перезахода в аккаунт': {
    severity: 'blocker', frequency: 'always', source: 'api', segment: 'enterprise',
    assignee: 9, answered: true, priority: 'p0',
  },
  'Выгрузка за большой период обрывается на середине': {
    severity: 'major', frequency: 'always', source: 'portal', segment: 'paid',
  },
  'Изменения пропадают при быстром переключении между филиалами': {
    severity: 'major', frequency: 'once', source: 'portal', segment: 'free',
    assignee: 10, answered: true,
  },
  'Итог по часам в файле не сходится с итогом на экране': {
    severity: 'blocker', frequency: 'always', source: 'email', segment: 'enterprise',
  },
  'При печати обрезается последний столбец недели': {
    severity: 'minor', frequency: 'always', source: 'portal', segment: 'free',
  },
  'Как передать права управляющего на время отпуска': {
    severity: 'minor', frequency: 'once', source: 'email', segment: 'paid',
  },
}

// ── Разложение фикстур в конкретные записи ──────────────────────────────

/**
 * Детерминированный PRNG. Не `Math.random()`: и лента на моках, и сид базы
 * обязаны получить один и тот же набор дат голосов — иначе trend_score
 * разойдётся, порядок ленты поедет, и «база даёт тот же портал» проверить
 * будет нечем.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Обращение, разложенное из фикстуры: id, slug и возрасты голосов. */
export interface ExpandedPost {
  id: string
  slug: string
  seed: PostSeed
  /**
   * Возрасты ВСЕХ голосов в днях — из них считается trend_score.
   *
   * Именно всех, а не выборки: в базе каждый голос обязан быть строкой
   * с уникальной парой (post_id, user_id), иначе vote_count, который ставит
   * триггер, разойдётся с числом из фикстуры. Раз в базе они настоящие,
   * то и на моках считаем по ним же — сравнивать два источника имеет смысл
   * только на одних и тех же данных. Суммарно это ~14 тысяч чисел.
   */
  voteAgesDays: number[]
  createdAgoDays: number
  updatedAgoDays: number
  /** Человекочитаемая ссылка: её называют в поддержке и в письмах. */
  ref: string
}

/**
 * Раскладывает фикстуры в конкретные записи. Чистая функция от индекса:
 * один и тот же вход даёт один и тот же выход в любом процессе.
 */
export function expandPosts(): ExpandedPost[] {
  return postSeeds.map((seed, i) => {
    const rand = mulberry32(i * 7919 + 13)

    /* `recency` — доля голосов, набранных за последние две недели: она и делает
       trending осмысленным, разводя старое популярное и свежее вспыхнувшее. */
    const recentCount = Math.round(seed.votes * seed.recency)
    const recentWindow = Math.min(14, seed.ageDays)
    const voteAgesDays: number[] = []

    for (let v = 0; v < recentCount; v++) {
      voteAgesDays.push(rand() * recentWindow)
    }
    for (let v = recentCount; v < seed.votes; v++) {
      voteAgesDays.push(recentWindow + rand() * Math.max(0, seed.ageDays - recentWindow))
    }

    return {
      id: `post-${String(i + 1).padStart(3, '0')}`,
      slug: slugify(seed.title),
      seed,
      voteAgesDays,
      createdAgoDays: seed.ageDays,
      /* Активность подтягивает дату обновления к сегодняшнему дню. */
      updatedAgoDays: seed.ageDays * (1 - 0.8 * seed.recency),
      ref: `RTM-${4000 + i * 37}`,
    }
  })
}

/**
 * Сколько всего нужно голосующих. Голоса за одно обращение обязаны быть
 * от разных людей — это главный инвариант таблицы vote.
 */
export const maxVotesPerPost = postSeeds.reduce((max, s) => Math.max(max, s.votes), 0)

/**
 * Цепочка статусов, через которые обращение прошло к текущему.
 *
 * В базе это строки `status_change` — история на странице обращения (FR-140)
 * и аудит. Здесь она задана декларативно, потому что фикстура описывает
 * конечный статус, а путь к нему нужно откуда-то взять.
 */
export const statusChains: Record<string, string[]> = {
  open: ['open'],
  'needs-info': ['needs-info', 'open'],
  planned: ['planned', 'open'],
  building: ['building', 'planned', 'open'],
  completed: ['completed', 'building', 'planned', 'open'],
  'not-reproducible': ['not-reproducible', 'needs-info', 'open'],
  duplicate: ['duplicate', 'open'],
  'wont-fix': ['wont-fix', 'open'],
}

/** Значения триажа для обращений, которых нет в `triageByTitle`. */
export const defaultTriage = {
  severity: 'minor',
  frequency: 'sometimes',
  source: 'portal',
  segment: 'free',
} as const

/** Полное тело обращения абзацами: показательное или собранное из краткого. */
export function detailsFor(seed: PostSeed): string[] {
  return postDetails[seed.title] ?? [seed.excerpt, detailsTail]
}

/** Комментарий, разложенный из фикстуры: автор, время, текст, ответы. */
export interface ExpandedComment {
  /** Индекс в `people` — реальный человек или сотрудник команды. */
  author: number
  agoDays: number
  body: string
  likes: number
  pinned: boolean
  replies: ExpandedComment[]
}

function countNodes(nodes: ExpandedComment[]): number {
  return nodes.reduce((n, c) => n + 1 + countNodes(c.replies), 0)
}

/**
 * Раскладывает тред обращения.
 *
 * Написанные вручную обсуждения идут первыми, дальше тред добивается репликами
 * из общего пула до заявленного в фикстуре числа. Добивать обязательно:
 * `comment_count` в базе ставит триггер по фактическим строкам, и если
 * материализовать только показательные три комментария, карточка обещающая
 * «128 комментариев» покажет три. Расхождение счётчика с содержимым —
 * ровно то, что триггеры и заведены не допускать.
 */
export function expandComments(post: ExpandedPost): ExpandedComment[] {
  const seed = post.seed
  const rand = mulberry32(seed.title.length * 104729 + 7)

  const fromSeed = (c: CommentSeed): ExpandedComment => ({
    author: c.author,
    agoDays: c.agoDays,
    body: c.body,
    likes: c.likes,
    pinned: c.pinned ?? false,
    replies: (c.replies ?? []).map(fromSeed),
  })

  const handwritten = (commentThreads[seed.title] ?? []).map(fromSeed)
  const filler: ExpandedComment[] = []
  const span = Math.max(1, post.createdAgoDays - post.updatedAgoDays)

  for (let i = countNodes(handwritten); i < seed.comments; i++) {
    filler.push({
      /* Последние двое в `people` — команда: их реплики не должны попадать
         в общий шум, иначе метка «ответ команды» перестанет что-то значить. */
      author: Math.floor(rand() * (people.length - 2)),
      agoDays: post.updatedAgoDays + rand() * span,
      body: genericComments[Math.floor(rand() * genericComments.length)]!,
      likes: Math.floor(rand() * 12),
      pinned: false,
      replies: [],
    })
  }

  return [...handwritten, ...filler.sort((a, b) => a.agoDays - b.agoDays)]
}

/** Смерженный дубликат, разложенный в самостоятельное обращение. */
export interface ExpandedMerged {
  title: string
  slug: string
  ref: string
  movedVotes: number
  /** Заголовок обращения, в которое этот дубликат объединён. */
  targetTitle: string
}

/**
 * Раскладывает объединённые дубликаты сквозным списком.
 *
 * Нумерация именно сквозная, а не внутри каждого целевого обращения: ссылка
 * вида «RTM-5131» уникальна во всём портале, её называют в поддержке, и два
 * разных обращения с одним номером — это не косметика, а невозможность
 * понять, о котором из них речь.
 */
export function expandMerged(): ExpandedMerged[] {
  return Object.entries(mergedInto).flatMap(([targetTitle, dupes]) =>
    dupes.map((d) => ({ ...d, targetTitle })),
  ).map((d, i) => ({
    title: d.title,
    slug: slugify(d.title),
    ref: `RTM-${5000 + i * 131}`,
    movedVotes: d.movedVotes,
    targetTitle: d.targetTitle,
  }))
}
