# User manual

**Languages:** [English](../en/11-manual.md) · [Español](../es/11-manual.md) · [Русский](../11-manual.md)

Three different people look at this portal, and they need different things. A visitor
wants to be heard. The team wants to work through the stream without losing what
matters. The administrator wants the portal to look and behave like their product.

The sections stand on their own — they do not continue one another.

---

## For a visitor

### Sending a request

Every board has a "New request" button. Two steps follow.

**First, the type.** The type decides the questions in the form: a bug is asked for
steps to reproduce and how often it happens, an idea for the problem it solves. Only
the team can change the type afterwards, so it is worth picking the right one.

**Second, the form.** While you type the title, the portal looks for similar requests
and shows them right under the field. If yours already exists — **vote for it**: a vote
on an existing request weighs more than one more request about the same thing. That is
how prioritisation works, and how the team finds things.

A screenshot, a video or a log is attached by dropping it in. Files go to storage
immediately, before you submit — so a large file does not make you wait after pressing
"Send". Attachments on bug reports are visible only to you and the team: screenshots
tend to contain other people's names and order numbers.

The first request from a new account goes to review and appears in the feed after it.
Your later requests are published straight away.

### What happens next

A request gets a number like `RTM-4821` — that is what support quotes. The team works
through the queue and takes a decision: accept it, ask for details, merge it with a
similar one, or decline it with a reason. **The reason always arrives by email** —
there is no silence in return here.

After that the request lives through statuses: New, Planned, In progress, Done. A change
of status is an email. The team's internal work stages send nothing: otherwise one
active task would produce five letters a week.

If the team lacked information, the request moves to "Needs info". Answer with a comment
and it goes back into work. Without an answer it closes after a few days, and that too
arrives by email.

### Votes, comments, subscription

A vote is "I need this too" on an idea and "same here" on a bug. One person, one vote;
pressing again removes it.

Voting or commenting subscribes you to updates. You can unsubscribe from the link in
any letter — no sign-in needed. Which letters arrive at all is set in your profile.

### Signing in

There is no password. You enter your email, get a letter with a link, follow it. The
link lives for 15 minutes and works once.

Reading the portal, searching and looking at the roadmap all work without signing in.
Voting and writing do not: a request is signed with your name, and the team has to know
who to come back to with a question.

### Two languages

The RU/EN switch is in the header. The choice is remembered.

If a request was written in another language, you see a translation marked "Translated
from Russian" with a "show original" button. The mark is required: before you answer
someone's words, you should know whose they are — the author's or a machine's. The
original is always one click away.

---

## For the team

### Moderation

`/admin/moderation` — requests from new accounts. Approve, or decline with a reason.
After the first approval a person is trusted and publishes immediately.

### The triage queue

`/admin/triage` is the team's main screen. The queue is sorted so that what is burning
is on top: a missed first-response deadline, a blocking bug, many people affected.

The queue is worked through from the keyboard, without touching the mouse:

| Keys | What they do |
|---|---|
| `↑ ↓` or `j k` | move through the queue |
| `Enter` | open the request |
| `1` … `7` | a decision on the request |
| `m` | merge with another |
| `/` | search, `Esc` to leave it |
| `?` | the keyboard help |

**A decision always states a reason**, and the reason goes to the author by email.
This is not a formality: the portal exists for the answer, not for the archive.

**Merging duplicates** moves votes and subscribers into the main request, and the
duplicate becomes a pointer to it — old links keep working. The operation is close to
irreversible, so it needs administrator rights.

**"Needs info"** starts a clock: after a few days a reminder goes to the author, after
a few more the request closes. The periods are set in the settings.

### The backlog

`/admin/backlog` — units of work. A request and a unit of work are different things
linked many-to-many: one task can be fed by several requests from different boards,
while technical debt has no requests at all and competes for priority on equal terms.

Reach and money are **computed, not typed**: the portal itself gathers the voters and
the authors of linked requests, deduplicates people and weights them by segment.
Otherwise prioritisation systematically overrates whatever a small loud group talks
about.

An **insight** is a quote from a user gathered outside the portal: a call, a ticket, a
chat. It attaches to a request or to a unit of work and counts towards reach as well.

A unit of work has its own internal stage. Some stages are tied to public statuses:
moving there moves the statuses of all linked requests and sends the letters. The rest
are internal — users never see them.

### Releases

`/admin/releases` — an entry is assembled in the portal: a draft, a list of changes by
type, the linked requests.

**Publishing is irreversible.** It closes the linked requests, marks them Done and
emails everyone who voted. That is why the screen shows not only the text but the
number of letters that will go out. The composition cannot be edited afterwards: the
letters have already been sent.

---

## For the administrator

Everything is configured in the portal, with no server access. Details are in
[10-operate.md](10-operate.md); briefly:

| Section | What is there |
|---|---|
| `/admin/settings` | Name, mark, domain, language, sections, limits, waiting periods, brand colour |
| `/admin/boards` | Boards: composition, names in two languages, visibility, order |
| `/admin/statuses` | Statuses: colour from the palette, marker shape, role on the roadmap |
| `/admin/types` | Request forms: the set of fields, labels, requiredness, options |
| `/admin/people` | People, roles, blocks |

### Roles

**User** reads, votes, writes. **Moderator** adds moderation and triage decisions.
**Administrator** adds merging, publishing releases, blocking and settings. **Owner**
adds handing out roles: an administrator able to make themselves owner would make the
owner role meaningless.

### What cannot be changed

A board's address and a status key, once created. They sit in links, in other people's
bookmarks and in the transition history of every request. Names, meanwhile, change
freely.

A status or a board with requests in it cannot be deleted — only hidden. History must
not get a hole in it.

---

## When something goes wrong

**Email does not arrive.** First — check whether the worker is running: without it
letters queue up and silently go nowhere. It looks like a mail channel problem while
the cause is a stopped process. Second — the channel itself: `MAIL_PROVIDER` and the
keys are set by environment variables.

**Search does not find things with typos.** The `pg_trgm` and `unaccent` extensions are
missing. The install wizard checks for them on its first step.

**Attachments disappeared after a restart.** `STORAGE_PROVIDER=file` keeps files in one
container's volume. Several copies of the app need S3.

**Translation does not work.** It is off by default. Turn it on with
`TRANSLATE_PROVIDER=claude` and an `ANTHROPIC_API_KEY`; without a key, requests wait in
the queue and get translated once it appears — no attempts are spent meanwhile.

**Requests are refused with "the limit".** The hourly or daily request limit hit. The
values are in the portal settings.
