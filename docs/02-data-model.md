# Модель данных

Целевая СУБД — PostgreSQL. Ниже логическая схема; типы даны в терминах Postgres,
имена — в `snake_case`. Все таблицы имеют `id uuid default gen_random_uuid()`,
`created_at timestamptz not null default now()`, `updated_at timestamptz`.

## Схема (обзор)

```
                    ┌── vote
                    ├── comment ──(self ref: parent_id)
board ──┬── post ───┼── subscription
        │    │      ├── attachment
        │    │      ├── post_tag ── tag
        │    │      ├── status_change
        │    │      └── diagnostics (jsonb на post)
        │    ├── post_type      (форма, workflow, видимость)
        │    └── intake_source  (portal | widget | email | api | import | admin)
        ├── category (self ref: parent_id)
        └── tag

app_user ──┬── vote / comment / post / subscription
           └── company (many-to-one)

post ──< backlog_post >── backlog_item ──┬── internal_status ── status_map ── status
                                         ├── theme
                                         └── insight ──(тоже может ссылаться на post)

changelog_entry ── changelog_post ── post
```

Три группы сущностей соответствуют трём контурам продукта:
**сбор** (`post` + `post_type` + `intake_source` + `attachment`),
**триаж** (поля решения на `post`, `status_change`, `merge_log`),
**бэклог** (`backlog_item` + `backlog_post` + `insight` + `internal_status`).

---

## Таблицы

### board

| Поле | Тип | Заметки |
|---|---|---|
| `name` | text not null | |
| `slug` | text not null unique | в URL |
| `description` | text | |
| `visibility` | enum(`public`,`private`,`readonly`) not null default `public` | FR-102 |
| `hidden_from_nav` | bool default false | FR-104 |
| `position` | int not null | порядок в навигации |
| `post_count` | int not null default 0 | денормализовано, только одобренные и несмерженные |
| `require_category` | bool default false | FR-121 |

### post

| Поле | Тип | Заметки |
|---|---|---|
| `board_id` | uuid → board | |
| `type_id` | uuid → post_type | идея / баг / проблема / вопрос / security (FR-501) |
| `source_id` | uuid → intake_source | откуда пришло (FR-557) |
| `author_id` | uuid → app_user, nullable | null = анонимизирован (FR-175) |
| `title` | text not null | 3–120 символов |
| `slug` | text not null | уникален в паре с `board_id`; **не меняется** при переименовании |
| `details` | text | markdown |
| `status_id` | uuid → status | |
| `category_id` | uuid → category, nullable | |
| `eta` | text, nullable | свободный формат: «Q3 2026», «Август 2026» |
| `moderation` | enum(`pending`,`approved`,`rejected`) default `approved` | FR-201 |
| `merged_into_id` | uuid → post, nullable | если не null — пост-указатель, нигде не показывается |
| `pinned` | bool default false | FR-216 |
| `vote_count` | int not null default 0 | денормализовано |
| `comment_count` | int not null default 0 | денормализовано, только публичные |
| `trend_score` | double precision not null default 0 | см. [Trending score](#trending-score) |
| `status_changed_at` | timestamptz | |
| `impact` / `confidence` / `effort` | smallint, nullable | FR-222 |
| `custom_fields` | jsonb default '{}' | FR-125 |
| `internal_note` | text | FR-219, не отдаётся публичным API |
| `search_tsv` | tsvector generated | см. [Поиск](#поиск) |

Поля, специфичные для обращений об ошибках (все nullable — у идей пусты):

| Поле | Тип | Заметки |
|---|---|---|
| `severity` | smallint | оценка **репортера**: 1 блокирует / 2 мешает / 3 косметика (FR-511) |
| `priority` | smallint | оценка **команды**: 0..3. Отдельное поле от `severity` — их слияние ломает и триаж, и отчётность (FR-536) |
| `frequency` | enum(`always`,`sometimes`,`once`) | |
| `started_at` | text | «когда началось», свободный формат |
| `environment` | jsonb | версия сборки, браузер, ОС, разрешение, локаль, TZ (FR-511) |
| `diagnostics` | jsonb | ошибки консоли, сетевые 4xx/5xx, breadcrumbs, trace id (FR-513/514). **Никогда не отдаётся публично** |
| `fingerprint` | text | подпись ошибки для авто-дедупликации (FR-521) |
| `affected_count` | int default 0 | уникальные затронутые = голоса + привязанные обращения + инсайты (FR-524) |
| `regression_of` | uuid → post | ссылка на ранее исправленный баг с тем же fingerprint (FR-525) |

Поля триажа (общие для всех типов):

| Поле | Тип | Заметки |
|---|---|---|
| `privacy` | enum(`public`,`reporter_team`,`team_only`) | FR-561 |
| `assignee_id` | uuid → app_user | FR-537 |
| `first_response_at` | timestamptz | для SLA (FR-538) |
| `sla_due_at` | timestamptz | вычисляется при приёме из политики SLA |
| `needs_info_since` | timestamptz | база для напоминания и авто-закрытия (FR-533) |
| `resolution` | enum(`fixed`,`duplicate`,`not_reproducible`,`by_design`,`wont_fix`,`auto_closed`), nullable | FR-532 |
| `resolution_reason_public` | text | уходит репортеру письмом (FR-535) |
| `resolution_reason_internal` | text | журнал решений (FR-641) |
| `resolved_by` / `resolved_at` | uuid / timestamptz | |
| `attachments_purge_at` | timestamptz | retention вложений и диагностики (FR-562) |

### status

Статусы — данные, а не enum в коде: их набор различается между продуктами (FR-231).

| Поле | Тип | Заметки |
|---|---|---|
| `key` | text unique | стабильный идентификатор: `open`, `planned`, `building`, `beta`, `completed`, `closed` |
| `name` | text | отображаемое, локализуемое |
| `color` | text | токен темы, не hex — см. правила форка |
| `position` | int | |
| `show_on_roadmap` | bool | попадает ли колонкой в Roadmap (FR-152) |
| `is_terminal` | bool | «закрыт»: не показывать в дефолтном фильтре ленты |
| `is_default` | bool | статус нового поста |

### post_type

Тип обращения — тоже данные: набор типов и их поведение различаются между продуктами.

| Поле | Тип | Заметки |
|---|---|---|
| `key` | text unique | `idea`, `bug`, `problem`, `question`, `security` |
| `name` / `description` | text | локализуемые, для экрана выбора типа |
| `form_schema` | jsonb | набор полей формы: имя, тип, обязательность, подсказка, варианты (FR-502) |
| `allowed_status_ids` | uuid[] | какие статусы допустимы для этого типа (FR-503) |
| `default_status_id` | uuid → status | |
| `default_privacy` | enum | как у `post.privacy` (FR-561) |
| `allows_votes` | bool | у `question`/`security` — false |
| `vote_label` | text | «Мне тоже нужно» vs «У меня тоже» — один и тот же голос значит разное |
| `default_sort` | enum(`trending`,`new`,`affected`) | для багов trending бессмысленен (FR-504) |
| `goes_to_backlog` | bool | `question` в бэклог не попадает (FR-507) |
| `enabled` | bool | фичефлаг типа для конкретного продукта |

### intake_source

| Поле | Тип | Заметки |
|---|---|---|
| `key` | text unique | `portal`, `widget`, `email`, `api`, `import`, `admin` |
| `name` | text | |
| `auto_publish` | bool | для `email`/`api` — **false**: чужая переписка не публикуется автоматически (FR-558) |

### sla_policy

`post_type_id`, `severity` (nullable = любая), `first_response_hours`.
Применяется при приёме: считает `post.sla_due_at` (FR-538).

### vote

| Поле | Тип | Заметки |
|---|---|---|
| `post_id` | uuid → post | |
| `user_id` | uuid → app_user | |
| `on_behalf_by` | uuid → app_user, nullable | FR-218: кто из команды добавил голос |
| **unique** | `(post_id, user_id)` | **главный инвариант**: один пользователь — один голос |

### comment

| Поле | Тип | Заметки |
|---|---|---|
| `post_id` | uuid → post | |
| `author_id` | uuid → app_user, nullable | |
| `parent_id` | uuid → comment, nullable | одноуровневая вложенность ответов |
| `body` | text not null | markdown |
| `image_urls` | text[] | |
| `internal` | bool default false | FR-139: **не отдаётся** публичным запросам |
| `pinned` | bool default false | FR-138 |
| `like_count` | int default 0 | |
| `deleted_at` | timestamptz | soft delete, чтобы не рвать тред |

`comment_like (comment_id, user_id)` — unique-пара.
`comment_mention (comment_id, user_id)` — для рассылки FR-302.

### attachment

Отдельная таблица, а не массив URL: у вложений бага есть тип, срок жизни и права доступа.

| Поле | Тип | Заметки |
|---|---|---|
| `post_id` / `comment_id` | uuid, ровно одно не null | |
| `kind` | enum(`image`,`video`,`log`,`har`,`other`) | |
| `storage_key` | text | ключ в объектном хранилище, не публичный URL |
| `mime` / `size_bytes` | text / bigint | whitelist MIME, лимиты по типу (FR-512) |
| `visibility` | enum(`public`,`team_only`) | вложения бага по умолчанию `team_only` (FR-561) |
| `purge_at` | timestamptz | retention (FR-562); джоба удаляет файл и строку |
| `scanned_at` / `scan_verdict` | timestamptz / text | проверка загруженного файла |

Отдача файла — только через приложение (подписанные короткоживущие ссылки),
не публичным бакетом: иначе `team_only` не соблюсти.

### subscription

| Поле | Тип | Заметки |
|---|---|---|
| `post_id` / `user_id` | uuid | unique-пара |
| `source` | enum(`vote`,`author`,`comment`,`manual`) | зачем подписан — влияет на текст письма |
| `unsubscribed_at` | timestamptz, nullable | не удаляем строку: иначе голос повторно подпишет |
| `token` | text unique | для one-click unsubscribe (FR-305) |

### category / tag

`category`: `board_id`, `name`, `slug`, `parent_id` (иерархия), `post_count`.
Unique: `(board_id, parent_id, name)`.

`tag`: `board_id`, `name`, `slug`, `post_count`. Unique: `(board_id, name)`.
`post_tag (post_id, tag_id)` — unique-пара.

> Референс: у ClickUp в доске Feature Requests 80+ категорий со счётчиками
> (`Automations 2 806`, `Hierarchy 4 808`, `Views 4 577`). Счётчики показываются
> в фильтре, значит они должны быть денормализованы, а не считаться на каждый рендер.

### status_change

`post_id`, `from_status_id`, `to_status_id`, `changed_by`, `note` (текст апдейта),
`notified_at`. Даёт историю на странице поста (FR-140) и аудит.

### app_user

| Поле | Тип | Заметки |
|---|---|---|
| `email` | citext unique | |
| `name` / `avatar_url` | text | |
| `role` | enum(`user`,`moderator`,`admin`,`owner`) default `user` | FR-232 |
| `external_id` | text, nullable, unique | id в основном продукте, для SSO (FR-173) |
| `company_id` | uuid → company, nullable | |
| `segments` | text[] | FR-223, приходят из основного продукта |
| `notification_prefs` | jsonb | FR-307 |
| `banned_at` | timestamptz | FR-204 |
| `trusted` | bool default false | true → посты не идут в модерацию |

### company

`name`, `domain` (unique), `member_count`, `monthly_spend numeric`, `custom_fields jsonb`.
Нужна только для приоритизации по деньгам (FR-224).

### changelog_entry

| Поле | Тип | Заметки |
|---|---|---|
| `title` / `slug` | text | |
| `body` | text | markdown |
| `types` | text[] | `new` / `improved` / `fixed` |
| `labels` | text[] | |
| `published_at` | timestamptz, nullable | null = черновик |
| `scheduled_for` | timestamptz, nullable | FR-166 |
| `reaction_counts` | jsonb | |

`changelog_post (entry_id, post_id)` — связь релиза с постами (FR-165).

### backlog_item

Единица работы. **Не пост.** Обоснование разделения — [06-backlog.md, раздел 0](06-backlog.md#0-центральное-решение-пост--элемент-бэклога).

| Поле | Тип | Заметки |
|---|---|---|
| `title` | text not null | внутренняя формулировка, отличается от публичной |
| `problem` | text | формулировка проблемы, а не решения |
| `kind` | enum(`feature`,`bug`,`tech`,`compliance`) | техдолг конкурирует за приоритет наравне (FR-605) |
| `theme_id` | uuid → theme, nullable | FR-606 |
| `parent_id` | uuid → backlog_item, nullable | фазы (FR-608) |
| `owner_id` | uuid → app_user | |
| `internal_status_id` | uuid → internal_status | FR-631 |
| `reach` | int | **вычисляется** из связанных постов и инсайтов, не вводится руками (FR-612) |
| `impact` / `confidence` / `effort` | numeric | FR-611 |
| `score` | numeric generated | по формуле из конфига; хранятся компоненты, чтобы пересчитать при смене формулы |
| `rank` | numeric | ручной порядок, дробная индексация (см. ниже) |
| `mrr_sum` | numeric | сумма `monthly_spend` затронутых компаний (FR-613) |
| `target_release` | text | «2026 Q4», «v3.2» |
| `estimate` | text | |
| `tracker_url` / `tracker_status` / `tracker_synced_at` | text / text / timestamptz | FR-652, FR-655 |
| `decision` | enum(`accepted`,`rejected`,`deferred`), nullable | FR-641 |
| `decision_reason_public` / `decision_reason_internal` | text | публичная формулировка уходит голосовавшим (FR-636) |

`backlog_post (backlog_item_id, post_id)` — unique-пара, связь N:M (FR-602).

`theme`: `name`, `description`, `slug`.

`internal_status`: `key`, `name`, `position`, `is_terminal`.

`status_map (internal_status_id, status_id)` — маппинг внутреннего статуса на публичный
(FR-632). Направление одностороннее: см. [Маппинг статусов](#маппинг-статусов).

### insight

Цитата пользователя из источника вне портала (FR-621).

| Поле | Тип | Заметки |
|---|---|---|
| `quote` | text not null | дословный фрагмент, не пересказ |
| `post_id` / `backlog_item_id` | uuid, хотя бы одно не null | |
| `author_id` | uuid → app_user, nullable | может быть неизвестен |
| `company_id` | uuid → company, nullable | |
| `source` | enum(`call`,`ticket`,`chat`,`interview`,`sales`,`other`) | |
| `source_url` | text | ссылка на исходник (запись звонка, тикет) |
| `weight` | smallint default 1 | вклад в Reach |

---

## Инварианты и механики

### Merge

Самая опасная операция: делается часто, ошибочно — тоже часто.

Условия: `source.id != target.id`; `source.merged_into_id is null`;
`target.merged_into_id is null` (нельзя мержить в указатель — цепочки запрещены,
если целевой уже смержен, берём его конечный target).

В одной транзакции:
1. `insert into vote (post_id, user_id) select target.id, user_id from vote where post_id = source ... on conflict (post_id, user_id) do nothing` — **дедупликация голосов обязательна**, иначе один человек даст два голоса.
2. Подписки — объединить тем же способом (`on conflict do nothing`), сохранив `unsubscribed_at` там, где он был.
3. `update comment set post_id = target where post_id = source` — комментарии переезжают, тред сохраняется.
4. `update post set merged_into_id = target, moderation = 'approved' where id = source`.
5. Пересчитать `vote_count` / `comment_count` у target из фактических строк (не инкрементом — инкремент разъедется с реальностью).
6. Записать в `merge_log (source_id, target_id, merged_by, moved_vote_user_ids uuid[])` — это то, что делает возможным unmerge (FR-213).

Следствия для чтения:
- **Все** публичные выборки постов фильтруют `merged_into_id is null` — забыть это в одном месте достаточно, чтобы дубликаты полезли в ленту. Реализовать одной переиспользуемой функцией/скоупом, а не копипастой условия.
- `GET /<board>/p/<slug>` для смерженного поста отдаёт **301** на целевой (старые ссылки из писем и Google не должны умирать).
- На целевом посте секция «Объединённые запросы» — `select title from post where merged_into_id = target` (FR-141).
- При merge пересчитываются `affected_count` и `reach` связанных элементов бэклога.

### Fingerprint и авто-дедупликация багов

Для идей похожесть ищется по заголовку, для багов — по подписи ошибки: пользователи
описывают одну и ту же ошибку десятью разными фразами, но стектрейс у неё один.

```
fingerprint = sha256( normalize(error_type) + '|' + top_3_stack_frames_without_addresses )
             либо, если стектрейса нет:
fingerprint = sha256( route + '|' + http_status + '|' + normalize(error_message) )
```

`normalize` вырезает: адреса памяти, uuid, числовые id, хеши сборки, query-строки, таймстемпы.
Без этого каждое обращение даст уникальную подпись и дедупликация не сработает.

Правила применения (FR-521..525):
- совпадение с открытым багом → новое обращение **не создаётся**: инкрементится
  `affected_count`, добавляется голос от репортера, его диагностика прикрепляется
  к существующему посту, репортеру показывается текущий статус;
- совпадение с багом, закрытым как `fixed` → создаётся новый пост с
  `regression_of = <старый>`, помечается регрессией и поднимается в очереди триажа;
- совпадение с багом, закрытым как `wont_fix`/`by_design` → репортеру показывается
  прошлое решение (FR-643), обращение создаётся только по его настоянию.

Fingerprint не заменяет ручной merge: он ловит только обращения с диагностикой
(из виджета и API). Ручные веб-формы по-прежнему требуют поиска похожих (FR-122).

### Reach и affected_count

Оба поля отвечают на «сколько людей это касается», но на разных уровнях,
и оба считаются, а не вводятся:

```
post.affected_count       = уникальные user_id из: vote(post) ∪ insight(post)
                            ∪ vote(любого поста, смерженного в этот)

backlog_item.reach        = Σ по уникальным user_id всех связанных постов и инсайтов
                              weight_сегмента(user)
backlog_item.mrr_sum      = Σ monthly_spend по уникальным company_id тех же пользователей
```

Ключевое требование — **дедупликация по пользователю на всех уровнях**. Один человек
может проголосовать за три поста, привязанных к одному элементу бэклога, и ещё быть
процитирован в двух инсайтах. Если посчитать это как шесть, приоритизация будет
систематически завышать то, о чём громче всех говорит небольшая группа.

Пересчёт — той же джобой, что и `trend_score`, плюс инкрементально при голосе/merge/привязке.

### Ранжирование бэклога (дробная индексация)

`rank numeric` вместо `position int`: при перетаскивании элемента между соседями с
ранками `a` и `b` новый ранг = `(a + b) / 2`. Обновляется одна строка вместо всей таблицы,
конкурентные перетаскивания не конфликтуют.

Раз в N перестановок (или при сближении значений теснее `1e-6`) — нормализующая джоба,
раскладывающая ранки заново с шагом 1000.

### Маппинг статусов

Одностороннее правило, нарушение которого даёт бесконечные петли и спам письмами:

```
внутренний статус (backlog_item.internal_status)
        │ status_map
        ▼
публичный статус (post.status) связанных постов  ──► письма подписчикам
        ▲
        └── ручная смена админом (тоже разрешена)

трекер ──вебхук──► внутренний статус     (но никогда напрямую в публичный)
```

- смена внутреннего статуса → обновление публичного у всех связанных постов → письма;
- смена публичного вручную → внутренний **не** меняется;
- письма уходят **только** при смене публичного статуса (FR-634). Внутренние переходы
  `in_progress → review → qa` пользователю не видны и не рассылаются — иначе на активной
  задаче человек получит пять писем за неделю и отпишется навсегда;
- каждая смена публичного статуса пишется в `status_change`, письма ставятся в очередь
  оттуда (а не из кода смены статуса) — тогда падение почты не откатывает статус (FR-309).

### Trending score

Наивные варианты плохи: по голосам — вечный топ старых постов; по дате — тонет всё нужное.
Нужно затухание.

```
trend_score = Σ over votes of exp( -age_days(vote) / HALF_LIFE )
HALF_LIFE = 21 (день), настраивается в конфиге
```

Читается как «сколько голосов набрано *недавно*». Свежий пост с 30 голосами за неделю
обгонит старый с 300 голосами трёхлетней давности — что и требуется.

Реализация:
- колонка `trend_score`, пересчёт cron-джобой раз в час батчами (только посты, у которых есть голоса за последние `3 × HALF_LIFE` дней — остальные асимптотически ноль);
- при новом голосе — инкремент на `1.0` сразу, чтобы UI реагировал мгновенно; расхождение выправит следующий пересчёт.

Альтернатива для старта (пока постов мало): считать в запросе через оконную функцию.
Работает до ~2–3k постов, дальше индекс становится обязательным.

### Денормализованные счётчики

`post.vote_count`, `post.comment_count`, `board.post_count`, `category.post_count`,
`tag.post_count` — обновляются **триггерами БД**, а не кодом приложения. Причина: писать
голоса будут API, админка, импорт CSV и вебхуки — четыре места, и в одном из них про
инкремент забудут. Триггер этого не забудет.

Плюс сверочная джоба раз в сутки: пересчёт счётчиков из фактов и лог расхождений.

Исключение — `post.affected_count`, `backlog_item.reach` и `backlog_item.mrr_sum`:
их нельзя считать триггером, потому что требуется дедупликация пользователей через
несколько join-ов (посты ↔ бэклог ↔ инсайты). Они пересчитываются джобой, а инкремент
при голосе используется только как оптимистичное приближение для UI.

### Поиск

Две разные задачи, две разные техники:

1. **Полнотекстовый поиск по ленте** (FR-115) — генерируемая колонка
   `search_tsv = to_tsvector(lang, title || ' ' || coalesce(details,''))`, индекс GIN,
   ранжирование `ts_rank`. Язык — из конфига продукта (`russian`/`english`;
   для смешанного контента — `simple` + `pg_trgm`).
2. **Поиск похожих при создании поста** (FR-122) — здесь нужны опечатки и частичные
   совпадения, а не стемминг: расширение `pg_trgm`, индекс
   `gin (title gin_trgm_ops)`, запрос по `similarity(title, :q) > 0.3`
   с сортировкой по схожести. Отдавать 3–5 кандидатов с их голосами и статусом.
   Для типа `bug` в кандидаты добавляются совпадения по `fingerprint` и по тексту ошибки
   из диагностики (FR-523) — они точнее любой похожести заголовков.
   Закрытые как `wont_fix`/`by_design` показывать тоже, с их публичной причиной (FR-643):
   лучший дубликат — тот, который не создали.

Когда постов станет > 20k и/или понадобится семантическое сходство —
выносить в отдельный поисковый слой (`pgvector` на эмбеддингах заголовков либо
Meilisearch/Typesense). До этого Postgres достаточно; закладывать сейчас — преждевременно.

### Индексы (минимально необходимые)

```sql
-- лента: сортировки × фильтр по статусу, только «живые» посты
create index on post (board_id, status_id, trend_score desc)
  where merged_into_id is null and moderation = 'approved';
create index on post (board_id, status_id, vote_count desc)
  where merged_into_id is null and moderation = 'approved';
create index on post (board_id, created_at desc)
  where merged_into_id is null and moderation = 'approved';

-- roadmap: срез по статусу через все доски
create index on post (status_id, vote_count desc)
  where merged_into_id is null and moderation = 'approved';

create unique index on post (board_id, slug);
create index on post using gin (search_tsv);
create index on post using gin (title gin_trgm_ops);

create unique index on vote (post_id, user_id);
create index on vote (user_id);              -- «за что я голосовал»
create index on vote (post_id, created_at);  -- пересчёт trend_score

create index on comment (post_id, created_at) where deleted_at is null;
create index on post (merged_into_id) where merged_into_id is not null;

-- типы обращений и лента багов (сортировка по охвату, не по trending)
create index on post (board_id, type_id, status_id, affected_count desc)
  where merged_into_id is null and moderation = 'approved';

-- авто-дедупликация багов
create index on post (fingerprint) where fingerprint is not null;

-- очередь триажа: непросмотренное и просроченное по SLA
create index on post (sla_due_at)
  where first_response_at is null and resolution is null;
create index on post (needs_info_since) where needs_info_since is not null;

-- бэклог
create index on backlog_item (rank);
create index on backlog_item (internal_status_id, score desc);
create unique index on backlog_post (backlog_item_id, post_id);
create index on backlog_post (post_id);
create index on insight (backlog_item_id);
create index on insight (post_id);
```

Частичные индексы (`where merged_into_id is null and moderation = 'approved'`) —
не микрооптимизация: это ровно тот предикат, который стоит в каждом публичном запросе.

### Пагинация

Только курсорная. Ключ курсора = `(сортировочное_поле, id)` в base64.
Offset-пагинация на живой ленте с голосованием даёт дубли и пропуски между страницами.
