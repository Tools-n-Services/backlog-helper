-- Кто загрузил вложение (FR-512).
--
-- Файл попадает в хранилище раньше, чем обращение — человек выбирает
-- скриншот, пока пишет текст. До отправки строка живёт без post_id, и
-- привязать её к обращению должен иметь право только тот, кто загружал:
-- идентификатор строки хоть и не угадывается, но «не угадывается» —
-- это не право доступа.
ALTER TABLE "attachment" ADD COLUMN "uploaded_by" UUID;

-- ON DELETE SET NULL: удаление аккаунта не должно уносить вложение
-- вместе с обращением, которое остаётся частью обсуждения (FR-175).
ALTER TABLE "attachment"
  ADD CONSTRAINT "attachment_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Имя файла показывается подписью под ссылкой. В ключ хранилища оно не идёт:
-- там бывает и кириллица, и пробелы, и чужие персональные данные вроде
-- «договор-иванов.png».
ALTER TABLE "attachment" ADD COLUMN "file_name" TEXT;

-- Незавершённые загрузки разбирает retention, и ищет он их именно так.
CREATE INDEX "attachment_staged_idx" ON "attachment" ("purge_at")
  WHERE "post_id" IS NULL;
