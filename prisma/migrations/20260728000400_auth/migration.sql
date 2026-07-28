-- Вход по одноразовой ссылке и серверные сессии (FR-171, FR-172).

-- Одноразовая ссылка входа.
--
-- Хранится ХЕШ токена, а не он сам: дамп этой таблицы не должен давать
-- возможность войти под любым пользователем. Сам токен живёт только
-- в письме и в адресной строке.
CREATE TABLE "verification_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verification_token_token_hash_key" ON "verification_token" ("token_hash");
-- По этому индексу считается частота запросов входа на адрес.
CREATE INDEX "verification_token_email_created_at_idx" ON "verification_token" ("email", "created_at");

-- Сессия в базе, а не в подписанном JWT: сессию нужно уметь прекращать —
-- при выходе, при бане, при смене прав. Токен в cookie ничего об этом
-- знать не может, пока не истечёт.
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_token_hash_key" ON "session" ("token_hash");
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
-- Для джобы, вычищающей истёкшие.
CREATE INDEX "session_expires_at_idx" ON "session" ("expires_at");

ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
