-- Человекочитаемый номер обращения («RTM-4821»).
--
-- Его называют в переписке с поддержкой и печатают в письмах, поэтому он
-- обязан быть стабильным и уникальным идентификатором, а не производной
-- от порядка строк: порядок меняется при любой перестановке, ссылка из
-- письма годовой давности — нет.
ALTER TABLE "post" ADD COLUMN "ref" TEXT;

-- Заполнение уже существующих строк, чтобы миграция прошла и на непустой
-- базе: на чистой установке этот шаг не затрагивает ни одной строки.
-- Нумерация подзапросом, а не оконной функцией прямо в SET: в UPDATE
-- оконные функции запрещены.
UPDATE "post" AS p
SET "ref" = 'RTM-' || (4000 + numbered.n * 37)
FROM (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "post"
) AS numbered
WHERE p."id" = numbered."id" AND p."ref" IS NULL;

ALTER TABLE "post" ALTER COLUMN "ref" SET NOT NULL;
CREATE UNIQUE INDEX "post_ref_key" ON "post" ("ref");
