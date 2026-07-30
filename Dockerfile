# syntax=docker/dockerfile:1

# Образ портала (В6, docs/09-install.md).
#
# Один образ на две роли: `app` отдаёт портал, `worker` крутит фоновые проходы.
# Разница только в команде запуска — код и зависимости у них общие, а два
# артефакта на каждую версию пришлось бы держать в согласии руками.
#
# Prisma здесь работает через драйверный адаптер, без бинарного движка:
# поэтому образ на alpine, а воркер — один собранный файл.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /src

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: postinstall генерирует клиент Prisma, а схемы на этом шаге
# ещё нет. Генерация идёт следующим слоем, после копирования исходников.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /src/node_modules ./node_modules
COPY . .
# Генерации клиента база не нужна, но конфигурация Prisma требует адрес.
# Фиктивный живёт только в этом слое: в рантайм-образ он не попадает.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm exec prisma generate \
 && pnpm build \
 && pnpm build:worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Приложение: самодостаточная сборка Next плюс собранный воркер.
WORKDIR /app
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/dist/worker.mjs ./worker.mjs

# Миграции — отдельным каталогом со своим Prisma CLI.
#
# Отдельным, потому что конфигурация Prisma импортирует `prisma/config`,
# и разрешаться он должен из своего node_modules, а не из подрезанного
# node_modules самодостаточной сборки, куда CLI не попадает и попасть
# не должен: серверу он не нужен.
WORKDIR /migrator
COPY --from=build /src/prisma ./prisma
COPY --from=build /src/prisma.config.ts ./prisma.config.ts
RUN npm init -y > /dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@7.9.1 \
 && npm cache clean --force

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
