-- Переводы обращений и комментариев (FR-181).
--
-- Перевод хранится, а не считается на лету, по трём причинам: он стоит денег
-- за каждый вызов, он не меняется, пока не изменён оригинал, и он должен
-- показываться мгновенно — читатель ленты не станет ждать чужой сервис.
--
-- Отдельная таблица, а не колонки `title_en`/`details_en`: языков может стать
-- три, и тогда колоночная схема требует миграции на каждый новый язык.
CREATE TABLE "translation" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id"    UUID,
  "comment_id" UUID,
  -- Язык перевода, не оригинала: оригинал записан в самой строке.
  "locale"     TEXT NOT NULL,
  -- У комментария заголовка нет — колонка пустует.
  "title"      TEXT,
  "body"       TEXT NOT NULL,
  -- Чем переведено. Меняя провайдера, форк захочет знать, что переводить заново.
  "provider"   TEXT NOT NULL,
  "model"      TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  -- Ровно один владелец. Строка без владельца — мусор, строка с двумя —
  -- перевод, который показывается не там, где создан.
  CONSTRAINT "translation_owner_chk" CHECK (
    ("post_id" IS NOT NULL AND "comment_id" IS NULL) OR
    ("post_id" IS NULL AND "comment_id" IS NOT NULL)
  ),
  CONSTRAINT "translation_post_fkey" FOREIGN KEY ("post_id")
    REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "translation_comment_fkey" FOREIGN KEY ("comment_id")
    REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Один перевод на язык. Частичные уникальные индексы вместо одного составного:
-- в составном NULL не равен NULL, и второй перевод того же комментария
-- на тот же язык прошёл бы молча.
CREATE UNIQUE INDEX "translation_post_locale_key"
  ON "translation" ("post_id", "locale") WHERE "post_id" IS NOT NULL;
CREATE UNIQUE INDEX "translation_comment_locale_key"
  ON "translation" ("comment_id", "locale") WHERE "comment_id" IS NOT NULL;

-- Язык оригинала определяется при отправке и больше не меняется:
-- переписанное обращение переводится заново, но язык у него тот же.
-- NULL — «не определяли»: так выглядят все обращения, написанные до
-- появления второго языка, и их не надо переводить задним числом.
ALTER TABLE "post" ADD COLUMN "source_locale" TEXT;
ALTER TABLE "comment" ADD COLUMN "source_locale" TEXT;

-- Очередь перевода — теми же полями, что очередь писем: отметка о выполнении
-- и счётчик попыток. Без счётчика обращение, которое провайдер не берёт
-- (слишком длинное, отказ модели), возвращалось бы в каждый проход навсегда.
ALTER TABLE "post" ADD COLUMN "translated_at" TIMESTAMPTZ(6);
ALTER TABLE "post" ADD COLUMN "translate_attempts" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "comment" ADD COLUMN "translated_at" TIMESTAMPTZ(6);
ALTER TABLE "comment" ADD COLUMN "translate_attempts" SMALLINT NOT NULL DEFAULT 0;

-- Проход воркера ищет строки ровно этим условием.
CREATE INDEX "post_translate_queue_idx" ON "post" ("created_at")
  WHERE "translated_at" IS NULL AND "source_locale" IS NOT NULL;
CREATE INDEX "comment_translate_queue_idx" ON "comment" ("created_at")
  WHERE "translated_at" IS NULL AND "source_locale" IS NOT NULL;
