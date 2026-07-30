-- Отметка «этот переход вызван публикацией релиза» (FR-165, FR-303).
--
-- Очередь писем — это `status_change`, и до сих пор все её строки означали
-- одно и то же: «статус изменился». Закрытие обращения релизом означает
-- другое — «то, что вы просили, вышло» — и письмо у него другое, со ссылкой
-- на запись changelog. Различить их по самому статусу нельзя: в `completed`
-- обращение может уйти и решением триажа, без всякого релиза.
--
-- Колонка нужна именно на переходе, а не выводится из `changelog_post`:
-- связь релиза с обращением живёт и до публикации, а письмо уходит ровно
-- один раз — в момент, когда запись опубликовали.
ALTER TABLE "status_change" ADD COLUMN "release_entry_id" UUID;

-- ON DELETE SET NULL: удалённая запись changelog не должна унести с собой
-- историю статусов обращения — переход в «Выполнено» остаётся фактом.
ALTER TABLE "status_change"
  ADD CONSTRAINT "status_change_release_entry_id_fkey"
  FOREIGN KEY ("release_entry_id") REFERENCES "changelog_entry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
