-- Настройки продукта в базе (В2, docs/09-install.md).
--
-- До сих пор название портала, лимиты и фичефлаги приезжали из
-- `config/product.ts` на этапе сборки: сменить название значило пересобрать
-- образ. Мастеру установки этого мало — он настраивает портал, который уже
-- запущен.
--
-- Одна строка на ключ, а не одна строка-документ: две вкладки админки,
-- сохраняющие разные разделы, при документе затрут друг друга — и тот, кто
-- правил лимиты, молча откатит чужие фичефлаги.
CREATE TABLE "setting" (
  "key"        TEXT PRIMARY KEY,
  -- jsonb, а не текст: значения разной природы — строки, числа, флаги,
  -- и разбирать «true» из текста пришлось бы в каждом чтении.
  "value"      JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Цвет статуса — имя из палитры, а не пара hex.
--
-- Раньше здесь лежало имя токена (`status-open`), а сами цвета — в theme/
-- по ключу статуса. Пока набор статусов правил форк файлом, это работало:
-- новый статус получал пару токенов той же выкладкой. Статус, заведённый
-- в админке, получить их не может — палитра в сборке, а статус в базе.
--
-- Поэтому цвет становится ссылкой на запись бандлированной палитры: набор
-- конечен, контраст текста к фону в нём проверен, и «палитра кончилась»
-- перестаёт быть возможным состоянием.
UPDATE "status" SET "color" = CASE "key"
  WHEN 'open'             THEN 'slate'
  WHEN 'needs-info'       THEN 'amber'
  WHEN 'planned'          THEN 'violet'
  WHEN 'building'         THEN 'teal'
  WHEN 'beta'             THEN 'slate'
  WHEN 'completed'        THEN 'green'
  WHEN 'duplicate'        THEN 'plum'
  WHEN 'not-reproducible' THEN 'rust'
  WHEN 'wont-fix'         THEN 'gray'
  WHEN 'no-response'      THEN 'gray'
  WHEN 'closed'           THEN 'gray'
  ELSE 'gray'
END;

ALTER TABLE "status" ALTER COLUMN "color" SET DEFAULT 'gray';
