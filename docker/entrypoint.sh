#!/bin/sh
# Запуск контейнера (В6, docs/09-install.md).
#
# ROLE=app     — миграции, затем сервер портала
# ROLE=worker  — фоновые проходы
#
# Миграции применяет только роль `app`, и это не мелочь: если их запускает
# и воркер, при масштабировании они пойдут наперегонки за одну и ту же базу.
set -e

case "${ROLE:-app}" in
  worker)
    exec node /app/worker.mjs --loop
    ;;
  app)
    echo "[entrypoint] применяю миграции…"
    cd /migrator && ./node_modules/.bin/prisma migrate deploy
    cd /app
    echo "[entrypoint] запускаю портал на ${PORT:-3000}"
    exec node server.js
    ;;
  *)
    echo "[entrypoint] неизвестная роль: ${ROLE}. Ожидается app или worker." >&2
    exit 1
    ;;
esac
