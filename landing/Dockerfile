# syntax=docker/dockerfile:1

# Лендинг (Railway).
#
# Отдаётся содержимое этого каталога: страница, стили, скриншоты и версии
# на английском и испанском. Контекст сборки — корень репозитория: так же
# собирается портал, и держать два разных контекста значит однажды перепутать.

FROM caddy:2-alpine

COPY landing/Caddyfile /etc/caddy/Caddyfile
COPY landing/index.html landing/styles.css /srv/
COPY landing/assets /srv/assets
COPY landing/en /srv/en
COPY landing/es /srv/es
# Инструкции — рядом со страницей: кнопки ведут на них относительными
# ссылками, и работают они независимо от того, что сейчас в ветке по
# умолчанию и останется ли репозиторий публичным.
COPY docs/*.md /srv/docs/
COPY docs/en /srv/docs/en
COPY docs/es /srv/docs/es

EXPOSE 80 8000
