# backlog-helper

**Русский:** [README.ru.md](README.ru.md) · **Docs:** [English](docs/en/) · [Español](docs/es/) · [Русский](docs/)

**A feedback portal you run yourself.** Users send feature requests and bug reports,
the team triages them, and the product backlog, roadmap and changelog are built from
that same stream.

Install it on your own server with one command and configure it in the browser —
no code to edit. One image serves any number of products: each gets its own domain,
its own database and its own settings.

```
   INTAKE                  TRIAGE                  BACKLOG
requests   ──────────►  a decision on each  ──────────►  units of work
(portal, widget,        (accept, merge,             (priority, N:M links
 email, support, API)    ask for info, decline)      to requests, tracker sync)
     ▲                                                        │
     └──────────── email, roadmap, changelog ◄────────────────┘
                        (closing the loop)
```

Closing the loop is the point of the whole thing: finishing a unit of work moves the
linked requests to `completed` and emails everyone who voted for them. Without it,
a portal is just a wall of wishes.

## Deploy it

A server with Docker and a domain pointed at it.

```bash
cp .env.example .env      # fill in PORTAL_DOMAIN, POSTGRES_PASSWORD, INSTALL_TOKEN
docker compose up -d
```

Then open `https://your-domain/install/enter?token=<INSTALL_TOKEN>` and walk the
wizard: environment checks, name and domain, the set of boards and types, a test
email, the owner. After that the wizard closes for good and the owner is already
signed in — without an email, because email may not be working yet at that point.

What comes up: Postgres with a volume, the app, the worker, and Caddy, which issues
the certificate for your domain itself. Migrations are applied when the app starts.

**A second product on the same server** — a copy of the directory with a different
`.env` and its own project name:

```bash
docker compose -p second-portal up -d
```

Its own database, its own domain, the same image. The two share nothing: everything
that makes them different lives in their databases.

Two things worth knowing before going live. **Without the worker, email queues up and
silently goes nowhere** — the most expensive mistake of a first install, because it
looks like a problem with the mail channel. And `STORAGE_PROVIDER=file` only suits a
single instance: attachments live in a volume that a second copy of the app cannot see.

Step by step, with checks at every stage — [docs/en/12-install.md](docs/en/12-install.md).

## Instructions

- [docs/en/12-install.md](docs/en/12-install.md) — installation step by step, with
  checks and a walkthrough of the usual failures.
- [docs/en/11-manual.md](docs/en/11-manual.md) — user manual: for visitors, for the
  team, for the administrator.
- [docs/en/10-operate.md](docs/en/10-operate.md) — operations: the three layers of
  configuration, and updating.

## What is configurable, and where

The layer decides what changes it and when. This is the main thing to understand
about the portal.

| Layer | What lives there | How it changes |
|---|---|---|
| **Admin** | name, mark, domain, language, sections, limits, waiting periods, brand colour, boards and categories, statuses, request types and their form fields | on the running portal, at once |
| **Environment (`.env`)** | database URL, mail channel and its keys, storage, translator, install token | by restarting the container |
| **Code (`config/*.ts`)** | field kinds, the meaning of system fields, the priority formula, the palette, attachment rules | by rebuilding the image |
| **Never** | a board's `slug`, a status or type `key` once created | — breaks links and history |

**Field kind is code, the set of fields is data.** The admin combines ready kinds
(text, textarea, select, checkbox, URL, environment, attachments), names the fields
and marks them required. A new *kind* is added in code.

**System fields** are the ones with logic beyond the form: `severity` sets the
first-response deadline and the order of the triage queue, `environment` feeds the
diagnostics that are never public. They can be renamed, reordered and removed from
the form — but not turned into something else, or prioritisation starts counting the
wrong thing and nothing tells you.

## Development

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

**You do not need to install a database.** `pnpm db:up` brings up a real PostgreSQL
from the `embedded-postgres` package into `.data/pg` — no Docker, nothing installed
system-wide. What sticks out is an ordinary `DATABASE_URL`, so in production it simply
points at a managed Postgres and the `db:*` commands are not needed there: the schema,
the migrations and the code are the same.

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm db:up` / `db:down` | Start and stop the local Postgres |
| `pnpm db:migrate` | Apply migrations (`migrate deploy`, not `dev` — see below) |
| `pnpm db:seed` | Load demo data from `config/seed.ts` |
| `pnpm db:reset` | Drop the cluster and rebuild it: migrations plus seed |
| `pnpm db:verify` | Check that triggers, indexes and search are in place |
| `pnpm db:bench` | Fill up to 15 000 requests and measure feed, roadmap, queue |
| `pnpm worker` | Background passes: scheduled releases, mail, translation, waiting on authors, recalculations, attachment retention, reconciliation (`--loop` to keep running) |
| `pnpm mail:check` | Check the mail channel; with an address, send a test letter |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests for the domain, queries and mutations (Vitest) |
| `pnpm test:e2e` | Scenario tests (Playwright) |

### Migrations are written by hand

`pnpm db:migrate` is `prisma migrate deploy`. **Never run `prisma migrate dev`:** it
compares the database to the schema and "fixes" the differences, and part of the schema
is beyond what Prisma can express — the generated `search_tsv` column, partial indexes,
counter triggers. One such run silently drops the GIN indexes, and search keeps
working, it just stops finding things.

`pnpm db:draft` produces a draft of the SQL; you edit it by hand and add it as a new
folder under `prisma/migrations/`. `pnpm db:verify` checks that everything is in place.

## Two languages, and translation

The interface speaks Russian and English. The language is chosen by cookie, then by
the browser header, then by the portal setting. Copy lives in `content/ru.json` and
`content/en.json`; the names of boards, statuses and types sit in the catalogue next
to the main ones (`nameEn` and friends) — a single-language fork simply leaves them out.

Requests and comments themselves are translated by `TRANSLATE_PROVIDER`: `off` (the
default) means no translation, `claude` means Claude Haiku with `ANTHROPIC_API_KEY`.
The source language is detected on submit, and the translation is done by a worker
pass: a bug report must be saved even when someone else's service is silent — the same
reason email goes out in its own pass. Without a key the pass does nothing and spends
no attempts: requests wait in the queue.

The reader sees the translation marked "Translated from Russian" with a "show original"
button. The mark is not decoration: before you answer someone's words, you should know
whose they are — the author's or a machine's.

## Email

Sign-in, team replies and status changes all rest on email, so the delivery channel is
set by `MAIL_PROVIDER`:

| Value | What it does |
|---|---|
| `file` (default) | Writes letters into `.data/mail` and prints them — sign-in by link works on a fresh clone without a single external service |
| `log` | Console only |
| `smtp` | Real delivery through your organisation's mail server |
| `unisender` | Unisender Go; needs `UNISENDER_API_KEY` |
| `resend` | Delivery over HTTP API when SMTP is blocked outbound; needs `RESEND_API_KEY` |

The difference between SMTP and an HTTP API is not reliability but what your network
blocks: port 587 outbound is closed more often than 443.

Real delivery needs three things, and it is usually the third one that is missing.

**1. A channel.** For `smtp` — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
Port 587 means STARTTLS, 465 means TLS from the first byte (`SMTP_SECURE=1`).
`SMTP_USER` without `SMTP_PASSWORD` is treated as an error rather than an open relay:
it is almost always a forgotten variable.

For `resend` — `RESEND_API_KEY`, and your own verified domain if you want to write to
anyone but the account owner. For `unisender` — `UNISENDER_API_KEY`, and the sender
domain must be verified in their panel; a letter from someone else's domain is
rejected, and that is the most common failure at the start.

**2. The portal address.** `PORTAL_ORIGIN` goes into the links inside letters — that is
how people come back. Without it the letter still arrives, and the link inside leads
nowhere.

**3. The worker.** Letters to subscribers do not go out from the request that changes
the status: the change leaves a row in `status_change`, and `pnpm worker` does the
sending. Otherwise an unavailable mail server would roll back the status change itself.
So without a running worker there is no email at all, however correctly the channel is
configured.

Check all of it at once with `pnpm mail:check`; with an address it also sends a test
letter:

```bash
pnpm mail:check you@example.com
```

## Roles and access

Four levels — [src/core/permissions.ts](src/core/permissions.ts). Powers are nested:
each role can do everything the previous one can.

| Role | What it can do |
|---|---|
| User | Reads, votes, writes requests and comments |
| Moderator | Plus the moderation queue and triage decisions |
| Administrator | Plus merging requests, blocking people, and portal settings |
| Owner | Plus assigning roles |

Permissions are checked in server actions, not only by hiding buttons: a hidden button
does not stop anyone from sending the same request directly. Three prohibitions are
hard and live in the domain: you cannot grant a role above your own, you cannot change
your own role, and you cannot demote the last owner.

There are no passwords — sign-in is a one-time link by email.

## Status

The portal is complete: it reads, writes, sends email and is run by a team.

Done: the whole schema from [02-data-model.md](docs/02-data-model.md), migrations with
counter triggers, sign-in by one-time link with server sessions, votes guaranteed by a
unique index, request intake with rate limits, comments, subscriptions, hybrid search
(full text plus trigrams), the moderation queue, triage decisions with a mandatory
reason, merging with vote deduplication, roles and blocking, email about statuses and
replies with per-user settings, real delivery (SMTP, Unisender Go, Resend),
auto-closing requests the author never answered, background recalculations, the backlog
as units of work with N:M links, prioritisation with computed reach, money and insights,
the release editor, attachments with permissions and retention, two interface languages
with translation of requests, the install wizard, and configuration from the admin.

**The loop is closed:** moving a unit of work to another internal stage moves the linked
requests to a public status and queues the letters; publishing a changelog entry closes
them and sends "the thing you asked for has shipped". Internal stages such as "in review"
are invisible to users and send nothing.

Load has been measured: 15 000 requests and 450 000 votes, all key queries within 500 ms
at p95.

Not done: drag ranking, tracker sync, bug deduplication by fingerprint, the intake widget
and API, backups out of the box, account deletion with anonymisation.

## Documentation

The design documents are in Russian and are the source of truth. The operational ones
exist in three languages.

| Document | About |
|---|---|
| [en](docs/en/12-install.md) · [es](docs/es/12-install.md) · [ru](docs/12-install.md) | Installation step by step |
| [en](docs/en/11-manual.md) · [es](docs/es/11-manual.md) · [ru](docs/11-manual.md) | User manual |
| [en](docs/en/10-operate.md) · [es](docs/es/10-operate.md) · [ru](docs/10-operate.md) | Deploy, configure, update |
| [00-product.md](docs/00-product.md) | Product description: the problem, who it is for, how it differs |
| [01-functional-spec.md](docs/01-functional-spec.md) | Requirements: public side, admin, notifications, integrations |
| [02-data-model.md](docs/02-data-model.md) | Entities, indexes, invariants of merge and votes |
| [03-architecture.md](docs/03-architecture.md) | Stack, repository layout, fork rules |
| [05-bug-intake.md](docs/05-bug-intake.md) | Bug intake: quality, diagnostics, triage, privacy |
| [06-backlog.md](docs/06-backlog.md) | Backlog: prioritisation, insights, tracker sync |
| [07-ui-brief.md](docs/07-ui-brief.md) | Design brief: surfaces, tokens, states |
| [08-dev-plan.md](docs/08-dev-plan.md) | Development plan by iteration and current status |
| [09-install.md](docs/09-install.md) | How installation and in-database configuration are built |

The landing page lives in [landing/](landing/) — a static page in three languages,
deployed as is.
