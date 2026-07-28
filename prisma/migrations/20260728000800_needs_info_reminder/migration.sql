-- Напоминание автору по обращению «нужна информация» (FR-533).
--
-- Отдельная отметка, а не вывод из needs_info_since: без неё напоминание
-- уходило бы каждым проходом воркера, то есть человек получал бы письмо
-- дважды в час до самого закрытия. Это верный способ добиться отписки
-- вместо ответа.
ALTER TABLE "post" ADD COLUMN "needs_info_reminded_at" TIMESTAMPTZ(6);

-- Обращения, ждущие автора, — единицы на фоне всей ленты, поэтому частичный.
CREATE INDEX "post_awaiting_reporter_idx" ON "post" ("needs_info_since")
  WHERE "needs_info_since" IS NOT NULL;
