-- Кто и когда решил судьбу обращения на модерации.
--
-- Решение модератора определяет, увидят ли обращение все остальные.
-- Анонимное решение такого веса разбирать не с кем: спорный случай
-- упирается в «кто-то отклонил» и заканчивается ничем.
ALTER TABLE "post" ADD COLUMN "moderated_by" UUID;
ALTER TABLE "post" ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

ALTER TABLE "post" ADD CONSTRAINT "post_moderated_by_fkey"
  FOREIGN KEY ("moderated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
