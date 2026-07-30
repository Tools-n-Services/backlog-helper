-- Справочники становятся источником правды, а не зеркалом конфига (В1).
--
-- До сих пор таблицы `status`, `post_type`, `board` наливались из `config/*.ts`
-- и хранили лишь часть описанного там: остальное приложение читало прямо
-- из конфига на этапе сборки. Пока портал разворачивался форком, это работало —
-- конфиг и база менялись одной выкладкой.
--
-- Мастер установки меняет модель: настройка живёт в базе и правится без
-- пересборки. Значит в базе должно лежать всё, что показывается человеку,
-- а не половина.
--
-- Колонки добавляются со значениями по умолчанию: миграция обязана быть
-- безопасной для базы, где уже есть обращения.

-- Названия на втором языке (FR-181). До сих пор лежали только в конфиге,
-- из-за чего доска в базе и её английское имя жили в разных местах.
ALTER TABLE "board" ADD COLUMN "name_en" TEXT;
ALTER TABLE "board" ADD COLUMN "description_en" TEXT;

ALTER TABLE "status" ADD COLUMN "name_en" TEXT;
-- Форма маркера — второй канал кодирования помимо цвета: бейдж обязан
-- читаться в оттенках серого (07-ui-brief.md, раздел 2). Значение
-- по умолчанию безопасное: точку умеет нарисовать любой статус.
ALTER TABLE "status" ADD COLUMN "shape" TEXT NOT NULL DEFAULT 'dot';

ALTER TABLE "post_type" ADD COLUMN "name_en" TEXT;
ALTER TABLE "post_type" ADD COLUMN "description_en" TEXT;
-- Заголовок карточки на экране выбора типа и продолжение заголовка формы.
-- Раньше это был switch по ключу типа в коде экрана — то самое ветвление,
-- из-за которого новый тип нельзя было завести, не правя компонент.
ALTER TABLE "post_type" ADD COLUMN "chooser_title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "post_type" ADD COLUMN "chooser_title_en" TEXT;
ALTER TABLE "post_type" ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "post_type" ADD COLUMN "prompt_en" TEXT;
ALTER TABLE "post_type" ADD COLUMN "vote_label_en" TEXT;
-- Формы счётного слова: «голос / голоса / голосов», «vote / votes / votes».
-- Массивом, а не тремя колонками: у другого языка форм может быть иначе,
-- и три колонки пришлось бы менять миграцией на каждый такой язык.
ALTER TABLE "post_type" ADD COLUMN "count_label" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "post_type" ADD COLUMN "count_label_en" TEXT[];

-- Пояснение к внутреннему этапу: «что значит „в проверке“» знает не каждый,
-- и на доске бэклога эта строка стоит рядом с колонкой.
ALTER TABLE "internal_status" ADD COLUMN "hint" TEXT NOT NULL DEFAULT '';
ALTER TABLE "internal_status" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
-- Итог обращения при закрытии через этот этап: «Выполнено» и «Не будем делать»
-- — разные итоги одного факта закрытия, и по ним считают, чем заканчиваются
-- запросы людей. Ссылка на публичный статус живёт в `status_map`.
ALTER TABLE "internal_status" ADD COLUMN "public_resolution" TEXT;
