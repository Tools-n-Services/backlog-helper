-- Слой Postgres, который Prisma выразить не умеет: полнотекстовый поиск,
-- триграммы, частичные индексы и триггеры счётчиков.
--
-- Это не обход ограничения ORM, а следование модели данных
-- (02-data-model.md, «Денормализованные счётчики»): счётчики обновляются
-- триггером, а не кодом приложения, потому что писать голоса будут портал,
-- API, админка и импорт — четыре места, и в одном из них про инкремент
-- забудут. Триггер не забудет.

/* ─────────────────────── Полнотекстовый поиск ─────────────────────── */

-- Конфигурация поиска — своя, а не 'russian' напрямую. Язык портала задаётся
-- в config/product.ts, но генерируемая колонка требует IMMUTABLE-выражения,
-- то есть литерала: подставить туда значение из конфига нельзя.
-- Поэтому имя конфигурации фиксировано, а её содержимое — точка настройки
-- форка: продукту на английском достаточно переопределить portal_search
-- своей миграцией, не трогая определение колонки.
--
-- Важно: после смены конфигурации сохранённые значения search_tsv нужно
-- пересчитать (ALTER TABLE post ALTER COLUMN search_tsv SET EXPRESSION ...
-- в PostgreSQL 17+, иначе DROP/ADD) — старые векторы сами не обновятся.
DROP TEXT SEARCH CONFIGURATION IF EXISTS portal_search;
CREATE TEXT SEARCH CONFIGURATION portal_search (COPY = russian);

-- Колонка создана предыдущей миграцией обычной, потому что Prisma умеет
-- описать только её тип. Генерируемой она становится здесь; превратить
-- существующую колонку в генерируемую на месте нельзя ни в одной версии
-- Postgres, поэтому пересоздаём.
ALTER TABLE "post" DROP COLUMN "search_tsv";
ALTER TABLE "post" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'portal_search'::regconfig,
      coalesce("title", '') || ' ' || coalesce("details", '')
    )
  ) STORED;

CREATE INDEX "post_search_tsv_idx" ON "post" USING GIN ("search_tsv");

-- Поиск похожих при создании обращения (FR-122): здесь нужны опечатки
-- и частичные совпадения, а не стемминг, поэтому триграммы, а не tsvector.
-- Порог подобран в src/core/domain/intake/similar.ts и обязан совпадать.
CREATE INDEX "post_title_trgm_idx" ON "post" USING GIN ("title" gin_trgm_ops);

/* ───────────────────────── Частичные индексы ──────────────────────── */

-- Все публичные выборки фильтруют merged_into_id is null и moderation =
-- 'approved'. Условие вынесено в индексы, чтобы «живые» посты не тонули
-- в указателях на смерженные.

CREATE INDEX "post_feed_trending_idx" ON "post" ("board_id", "status_id", "trend_score" DESC)
  WHERE "merged_into_id" IS NULL AND "moderation" = 'approved';

CREATE INDEX "post_feed_top_idx" ON "post" ("board_id", "status_id", "vote_count" DESC)
  WHERE "merged_into_id" IS NULL AND "moderation" = 'approved';

CREATE INDEX "post_feed_new_idx" ON "post" ("board_id", "created_at" DESC)
  WHERE "merged_into_id" IS NULL AND "moderation" = 'approved';

-- Роадмап: срез по статусу через все доски (FR-151).
CREATE INDEX "post_roadmap_idx" ON "post" ("status_id", "vote_count" DESC)
  WHERE "merged_into_id" IS NULL AND "moderation" = 'approved';

-- Лента багов сортируется по охвату, а не по trending (FR-504).
CREATE INDEX "post_affected_idx" ON "post" ("board_id", "type_id", "status_id", "affected_count" DESC)
  WHERE "merged_into_id" IS NULL AND "moderation" = 'approved';

CREATE INDEX "post_merged_into_idx" ON "post" ("merged_into_id")
  WHERE "merged_into_id" IS NOT NULL;

-- Авто-дедупликация багов по подписи ошибки (FR-521).
CREATE INDEX "post_fingerprint_idx" ON "post" ("fingerprint")
  WHERE "fingerprint" IS NOT NULL;

-- Очередь триажа: неотвеченное и просроченное по SLA (FR-538).
CREATE INDEX "post_sla_due_idx" ON "post" ("sla_due_at")
  WHERE "first_response_at" IS NULL AND "resolution" IS NULL;

CREATE INDEX "post_needs_info_idx" ON "post" ("needs_info_since")
  WHERE "needs_info_since" IS NOT NULL;

-- Живой тред: удалённые комментарии остаются строками, но из выборок уходят.
CREATE INDEX "comment_live_idx" ON "comment" ("post_id", "created_at")
  WHERE "deleted_at" IS NULL;

/* ────────────────────── Триггеры счётчиков ────────────────────────── */

-- post.vote_count

CREATE OR REPLACE FUNCTION sync_post_vote_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE "post" SET "vote_count" = "vote_count" + 1 WHERE "id" = NEW."post_id";
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE "post" SET "vote_count" = GREATEST(0, "vote_count" - 1) WHERE "id" = OLD."post_id";
  ELSIF (TG_OP = 'UPDATE' AND NEW."post_id" IS DISTINCT FROM OLD."post_id") THEN
    -- Голос переезжает при merge.
    UPDATE "post" SET "vote_count" = GREATEST(0, "vote_count" - 1) WHERE "id" = OLD."post_id";
    UPDATE "post" SET "vote_count" = "vote_count" + 1 WHERE "id" = NEW."post_id";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "vote_count_sync"
AFTER INSERT OR UPDATE OR DELETE ON "vote"
FOR EACH ROW EXECUTE FUNCTION sync_post_vote_count();

-- post.comment_count — только публичные и неудалённые (FR-139).

CREATE OR REPLACE FUNCTION comment_counts_publicly(p_internal boolean, p_deleted timestamptz)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_internal = false AND p_deleted IS NULL THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION sync_post_comment_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_weight int := 0;
  new_weight int := 0;
BEGIN
  IF (TG_OP <> 'INSERT') THEN
    old_weight := comment_counts_publicly(OLD."internal", OLD."deleted_at");
  END IF;
  IF (TG_OP <> 'DELETE') THEN
    new_weight := comment_counts_publicly(NEW."internal", NEW."deleted_at");
  END IF;

  IF (TG_OP = 'UPDATE' AND NEW."post_id" IS DISTINCT FROM OLD."post_id") THEN
    UPDATE "post" SET "comment_count" = GREATEST(0, "comment_count" - old_weight)
      WHERE "id" = OLD."post_id";
    UPDATE "post" SET "comment_count" = "comment_count" + new_weight
      WHERE "id" = NEW."post_id";
  ELSIF (new_weight <> old_weight) THEN
    UPDATE "post" SET "comment_count" = GREATEST(0, "comment_count" + new_weight - old_weight)
      WHERE "id" = COALESCE(NEW."post_id", OLD."post_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "comment_count_sync"
AFTER INSERT OR UPDATE OR DELETE ON "comment"
FOR EACH ROW EXECUTE FUNCTION sync_post_comment_count();

-- board.post_count и category.post_count.
--
-- Считается ровно то, что видно в ленте: одобренное, несмерженное и такого
-- типа, который вообще попадает в публичную ленту. Последнее условие
-- существенно: вопросы (FR-507) лежат в тех же досках, но в ленте их нет,
-- и счётчик, включающий их, врал бы на карточке доски.

CREATE OR REPLACE FUNCTION post_counts_publicly(
  p_moderation "moderation", p_merged_into uuid, p_type_id uuid
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_moderation = 'approved'
     AND p_merged_into IS NULL
     AND EXISTS (SELECT 1 FROM "post_type" t WHERE t."id" = p_type_id AND t."public_feed")
    THEN 1 ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION sync_post_counts() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_weight int := 0;
  new_weight int := 0;
BEGIN
  IF (TG_OP <> 'INSERT') THEN
    old_weight := post_counts_publicly(OLD."moderation", OLD."merged_into_id", OLD."type_id");
  END IF;
  IF (TG_OP <> 'DELETE') THEN
    new_weight := post_counts_publicly(NEW."moderation", NEW."merged_into_id", NEW."type_id");
  END IF;

  IF (TG_OP <> 'INSERT' AND old_weight <> 0) THEN
    UPDATE "board" SET "post_count" = GREATEST(0, "post_count" - old_weight)
      WHERE "id" = OLD."board_id";
    IF (OLD."category_id" IS NOT NULL) THEN
      UPDATE "category" SET "post_count" = GREATEST(0, "post_count" - old_weight)
        WHERE "id" = OLD."category_id";
    END IF;
  END IF;

  IF (TG_OP <> 'DELETE' AND new_weight <> 0) THEN
    UPDATE "board" SET "post_count" = "post_count" + new_weight
      WHERE "id" = NEW."board_id";
    IF (NEW."category_id" IS NOT NULL) THEN
      UPDATE "category" SET "post_count" = "post_count" + new_weight
        WHERE "id" = NEW."category_id";
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "post_counts_sync"
AFTER INSERT OR UPDATE OR DELETE ON "post"
FOR EACH ROW EXECUTE FUNCTION sync_post_counts();

-- tag.post_count

CREATE OR REPLACE FUNCTION sync_tag_post_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE "tag" SET "post_count" = "post_count" + 1 WHERE "id" = NEW."tag_id";
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE "tag" SET "post_count" = GREATEST(0, "post_count" - 1) WHERE "id" = OLD."tag_id";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "tag_post_count_sync"
AFTER INSERT OR DELETE ON "post_tag"
FOR EACH ROW EXECUTE FUNCTION sync_tag_post_count();

-- comment.like_count

CREATE OR REPLACE FUNCTION sync_comment_like_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE "comment" SET "like_count" = "like_count" + 1 WHERE "id" = NEW."comment_id";
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE "comment" SET "like_count" = GREATEST(0, "like_count" - 1) WHERE "id" = OLD."comment_id";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "comment_like_count_sync"
AFTER INSERT OR DELETE ON "comment_like"
FOR EACH ROW EXECUTE FUNCTION sync_comment_like_count();
