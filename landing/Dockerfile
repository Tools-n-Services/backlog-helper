# syntax=docker/dockerfile:1

# Лендинг: одна самодостаточная страница (Railway).
#
# Контекст сборки — корень репозитория, а не этот каталог: страница живёт
# в docs/ и должна остаться в одном экземпляре. В Railway это задаётся
# переменной RAILWAY_DOCKERFILE_PATH=landing/Dockerfile.

FROM caddy:2-alpine

COPY landing/Caddyfile /etc/caddy/Caddyfile
COPY docs/presentation.html /srv/index.html
# Документы рядом: ссылки со страницы относительные, и без них они ведут
# в никуда. Класть сюда копии, а не ссылаться на GitHub, — чтобы страница
# не зависела ни от ветки, ни от того, останется ли репозиторий публичным.
COPY docs/*.md /srv/

EXPOSE 80
