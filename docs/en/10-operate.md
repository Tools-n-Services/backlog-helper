# Deploy, configure, update

**Languages:** [English](../en/10-operate.md) · [Español](../es/10-operate.md) · [Русский](../10-operate.md)

Three sections for three different jobs. They are read at different times and usually
by different people: you deploy once, configure for weeks, update for years.

---

## Deploy

The short version. Step by step, with checks and a walkthrough of failures —
[12-install.md](12-install.md).

A server with Docker and a domain pointed at it by an A record. Then:

```
cp .env.example .env
docker compose up -d
```

Three lines in `.env` are required — without them compose refuses to start and names
the one that is missing:

| Variable | What it is |
|---|---|
| `PORTAL_DOMAIN` | The portal's domain. Caddy issues the certificate for it |
| `POSTGRES_PASSWORD` | The database password inside compose. The database is not exposed |
| `INSTALL_TOKEN` | A long random string. Without it the install wizard does not exist |

Then open `https://your-domain/install/enter?token=<INSTALL_TOKEN>` and walk the
wizard: environment checks, name and domain, the set of boards and types, a test email,
the owner.

The wizard closes for good afterwards, and the owner is inside straight away — without
an email. That is deliberate: a misconfigured mail channel would otherwise lock you out
of a fresh portal, because there is nobody to sign in and the settings can only be
fixed from the inside.

### What comes up

Postgres with a volume, the app, the worker and Caddy. Migrations are applied by the
app at startup — no separate command.

### What to know before going live

**Without the worker, email does not go out.** It queues letters silently, and "the
portal does not send email" is the most expensive mistake of a first install, because
it looks like a mail channel problem. In compose the worker starts by itself; if you
deploy differently, start it separately.

**`STORAGE_PROVIDER=file` suits a single instance.** Attachments live in a volume that
a second copy of the app cannot see. For several — S3 (`S3_ENDPOINT`, `S3_BUCKET`, keys).

**Email is configured by environment variables, not in the portal.** The wizard checks
it — sends a test letter and waits for confirmation — but only whoever sets the
environment can set the channel. Keys in the database would mean that a database dump
is a leak of every key at once.

### A second product on the same server

A copy of the directory with its own `.env` and its own project name:

```
docker compose -p second-portal up -d
```

Its own database, its own domain, the same image. The two share nothing: everything
that makes them different lives in their databases.

---

## Configure

Configuration is spread across three layers. This is the main thing to understand about
the portal: the layer decides what changes it and when.

| Layer | What lives there | How it changes |
|---|---|---|
| **Admin** | name, mark, domain, language, sections, limits, waiting periods, brand colour, boards and categories, statuses, request types and their form fields | on the running portal, at once |
| **Environment (`.env`)** | database URL, mail channel and its keys, storage, translator, install token | by restarting the container |
| **Code (`config/*.ts`)** | form field kinds, the meaning of system fields, the priority formula, the palette, attachment rules | by rebuilding the image |
| **Never** | a board's `slug`, a status or type `key` once created | — breaks links and history |

Where things are in the admin:

- **Settings** — product, sections, limits, waiting periods, appearance.
- **Boards** — composition, names in two languages, visibility, order.
- **Statuses** — composition, colour from the palette, marker shape, role on the roadmap.
- **Forms** — the fields of each request type: composition, labels, requiredness,
  options.

### Where the line between admin and code runs

**Field kind is code, the set of fields is data.** The wizard and the admin combine
ready kinds (text, textarea, select, checkbox, URL, environment, attachments), name the
fields and mark them required. A new *kind* — say, a geolocation — is added in code.

**System fields** stand apart: they have logic beyond the form. `severity` sets the
first-response deadline and the order of the triage queue; `environment` feeds the
diagnostics that are never public. They can be renamed, reordered and removed from the
form, but not turned into something else: prioritisation would start counting the wrong
thing, and nothing would tell you.

Everything else created in the editor is a free field. Such fields are shown on the
request and go into letters, but they stay out of the logic. That is the price of being
free to create them.

---

## Update

The version of an installation is the image tag.

```
docker compose pull
docker compose up -d
```

The app applies the migrations at startup. The order is worth following literally:
**backup first, update second.** The migrations here are written by hand and sometimes
change data; rolling back means restoring, not a reverse migration.

What survives an update without intervention:

- **Settings.** A key your database does not have yet arrives from the new version's
  preset — no data migration, no empty values on screen.
- **Sections of settings written only in part.** A flag added in a new version comes up
  enabled by default rather than silently off.
- **Catalogues.** Boards, statuses and types were edited in your admin and updates do
  not touch them: a preset holds values for a new installation, not a state an existing
  one is forced into.

### If you keep a fork

A fork is no longer required: everything that makes products different has moved into
the database. It is needed only when the code changes — field kinds, the priority
formula, the palette.

Then the upstream is added as a second remote and your edits stay in `config/` and
`theme/`. The version a fork is built from is pinned by a tag: without that, five
products become five different products within a year.

### What CI does

On every pull request — types, linter, unit tests and scenarios against a built portal,
all on a real Postgres. On a `v*` tag — building the image and publishing it to the
repository's registry.

Without this, a fix in the template reaches none of the installations — and that is the
most expensive outcome of all.
