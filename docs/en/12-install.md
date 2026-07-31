# Installation, step by step

**Languages:** [English](../en/12-install.md) · [Español](../es/12-install.md) · [Русский](../12-install.md)

For whoever is installing the portal for the first time. The quick version is three
commands in the [README](../../README.md); this is the same thing with a check after
every step, and with what to do when a step fails.

Fifteen minutes, ten of which are waiting for DNS.

---

## Step 0. What to prepare

**A server.** Any Linux with Docker. At least 2 GB of memory and 20 GB of disk: the
portal and the worker take little, the space goes to the database and attachments.
Ports 80 and 443 must be free — the proxy takes them, and the certificate is issued
over 80.

**A domain.** An A record pointing at the server. Check that it has propagated:

```bash
dig +short feedback.example.com
```

Until that returns your server's address there is no point going further: the
certificate will not be issued.

**A mail channel.** Signing in to the portal only works by email, so the channel is
needed from the start. Options are your organisation's SMTP, Unisender Go or Resend.
For Resend the domain has to be verified in their panel: until it is, letters only go
to the account owner's address.

**Docker.** Check that it is there and speaks compose:

```bash
docker version && docker compose version
```

---

## Step 1. Get the deployment files

```bash
git clone https://github.com/Tools-n-Services/backlog-helper.git
cd backlog-helper
```

The sources are not needed for building — the image comes from the registry — but for
`compose.yml`, the `Caddyfile` and `.env.example`. Copy just those if you prefer.

---

## Step 2. Fill in `.env`

```bash
cp .env.example .env
```

Three lines are required. Without any of them compose refuses to start and names the
one that is missing.

```
PORTAL_DOMAIN=feedback.example.com
POSTGRES_PASSWORD=<a long random string>
INSTALL_TOKEN=<a long random string>
```

To generate both:

```bash
openssl rand -base64 24
```

The mail channel goes here too. For Resend, for example:

```
MAIL_PROVIDER=resend
MAIL_FROM="Portal name <feedback@example.com>"
RESEND_API_KEY=re_...
```

Everything else can stay as it is: storage defaults to files, translation is off.

**`INSTALL_TOKEN` is the key to a fresh portal.** Until the installation is finished,
anyone holding that token can make themselves the owner. Do not send it over chat and
do not leave it in your shell history.

---

## Step 3. Start

```bash
docker compose up -d
```

Four containers come up: the database, the portal, the worker and the proxy. The first
start takes a minute or two — the image is pulled, the database is initialised, the
app applies the migrations.

Check that everything is up:

```bash
docker compose ps
```

The database and the portal should say `healthy`. If the portal stays `starting` for
longer than a minute, read its log:

```bash
docker compose logs app --tail 50
```

The certificate is issued on the first request to the domain. If it was not, the cause
is almost always DNS or a busy port 80 — see the end of this document.

---

## Step 4. Walk the wizard

Open in a browser:

```
https://feedback.example.com/install/enter?token=<INSTALL_TOKEN>
```

Five steps.

**Environment checks.** A list with ticks: database, migrations, search extensions,
time zone, writing to storage. A red line names the cause and what to do about it. You
can continue with errors, but what is listed will break later — and nothing will tell
you.

**Product.** Name, the mark in the header, domain, default language. All of it is
editable later in the admin.

**Where to start.** A set of boards, request types and statuses: full, bugs only, or
minimal. The choice commits you to nothing — the composition is editable later.

**Email.** Here the wizard sends a test letter to the future owner's address. **Wait
for it and make sure it arrives.** This is the only moment when checking email is
painless: after the installation, signing in works only through it.

**The owner.** Email and name. After "Install the portal" you end up inside right
away — without an email. That is deliberate: a misconfigured mail channel would
otherwise lock you out of a fresh portal, because there is nobody to sign in and the
settings can only be fixed from the inside.

The wizard closes after that, for good. Reopening it means clearing the installation
flag in the database — it cannot be done over the web.

---

## Step 5. Check that it works

| What | How |
|---|---|
| The portal answers | Open `https://your-domain` — the home page with boards |
| You are the owner | The header has a way into the admin, and Settings is available |
| The worker is alive | `docker compose logs worker --tail 20` — the passes are listed |
| Email works | Sign out and back in: the link must arrive by email |
| Backups | Set up database backups **today**, not later |

The last one is not a formality. Your users' requests currently exist in one copy, and
a backup you have never restored from does not count as a backup.

```bash
docker compose exec -T db pg_dump -U backlog backlog | gzip > backup-$(date +%F).sql.gz
```

---

## Step 6. First settings

Everything from here happens in the portal, with no server access:

- **Settings** — name, sections, limits, waiting periods, colour.
- **Boards** — composition and order; a board's address never changes once created.
- **Statuses** — colours from the palette, what appears on the roadmap.
- **Forms** — which fields to ask for in each request type.
- **People** — roles: moderator, administrator, owner.

More in the [user manual](11-manual.md).

---

## Updating

```bash
docker compose exec -T db pg_dump -U backlog backlog | gzip > backup-$(date +%F).sql.gz
docker compose pull
docker compose up -d
```

In exactly that order: migrations sometimes change data, and rolling back is done by
restoring a backup, not by a reverse migration.

To make updating a deliberate act rather than a side effect of a restart, pin the
image tag:

```
IMAGE_TAG=v1.2.0
```

---

## A second product on the same server

A copy of the directory with its own `.env` — a different domain, a different database
password, a different token:

```bash
cp -r backlog-helper backlog-helper-second
cd backlog-helper-second && $EDITOR .env
docker compose -p second-portal up -d
```

The same image, its own database, its own domain. The two share nothing: everything
that makes them different lives in their databases. Ports 80 and 443 are taken by the
first proxy — the second product needs either its own server or a shared proxy holding
both domains (then remove `proxy` from the second compose file and add the domain to
the first `Caddyfile`).

---

## When something is wrong

**The certificate was not issued, the browser complains.** Check `dig +short domain` —
the A record must point at the server. Then `docker compose logs proxy`: Caddy states
the reason plainly. A common cause is a busy port 80 — the ownership check goes through
it.

**`/install` returns 404.** Either `INSTALL_TOKEN` is not set in `.env` — then the
wizard does not exist at all, and that is protection rather than a fault; or the
installation is already finished. Check that you are opening
`/install/enter?token=…` and not `/install`.

**The portal will not start, the log shows migration errors.** Most likely the database
was created without the right locale. It is set when the cluster is initialised and
cannot be changed afterwards — the database has to be recreated: `docker compose down -v`
removes the data as well, so only do this on an empty installation.

**Email does not arrive.** First the worker: `docker compose ps` and
`docker compose logs worker`. Without it letters queue up and silently go nowhere;
it looks like a problem with the mail channel. If the worker is alive, read its log —
the channel states the reason for the refusal.

**Attachments disappear after a restart.** Check that the `uploads` volume is mounted
(`docker compose config | grep uploads`). For several copies of the app, file storage
does not work at all — you need S3.

**You forgot who the owner is and nobody can sign in.** An owner can be appointed
straight in the database:

```bash
docker compose exec -T db psql -U backlog backlog \
  -c "update app_user set access_role='owner', is_team=true where email='you@example.com'"
```
