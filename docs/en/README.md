# Documentation — English

**Languages:** [English](../en/) · [Español](../es/) · [Русский](../)

A feedback portal you run yourself: feature requests and bug reports, triage, backlog,
roadmap and changelog in one data model. It installs on your own server with one
command and is configured in the browser.

## Operating the portal

| Document | About |
|---|---|
| [12-install.md](12-install.md) | Installation step by step: preparation, `.env`, start, the wizard, verification, updating, and the usual failures |
| [11-manual.md](11-manual.md) | User manual: for visitors, for the team, for the administrator |
| [10-operate.md](10-operate.md) | Deploy, configure, update: the three layers of configuration and what survives an update |

## Design documents

These are in Russian and are the source of truth: they change with every iteration, and
keeping three copies of them in agreement by hand would cost more than it gives.

| Document | About |
|---|---|
| [00-product.md](../00-product.md) | Product description: the problem, who it is for, how it differs from the alternatives |
| [01-functional-spec.md](../01-functional-spec.md) | Requirements: public side, admin, notifications, integrations |
| [02-data-model.md](../02-data-model.md) | Entities, indexes, the invariants of merge and votes |
| [03-architecture.md](../03-architecture.md) | Stack, repository layout, fork rules |
| [05-bug-intake.md](../05-bug-intake.md) | Bug intake: quality, diagnostics, triage, privacy |
| [06-backlog.md](../06-backlog.md) | Backlog: prioritisation, insights, tracker sync |
| [07-ui-brief.md](../07-ui-brief.md) | Design brief: surfaces, tokens, states |
| [08-dev-plan.md](../08-dev-plan.md) | Development plan by iteration and its current state |
| [09-install.md](../09-install.md) | How installation by wizard and configuration in the database are built |

## The three loops

```
   INTAKE                  TRIAGE                  BACKLOG
requests   ──────────►  a decision on each  ──────────►  units of work
(portal, widget,        (accept, merge,             (priority, N:M links
 email, support, API)    ask for info, decline)      to requests, tracker sync)
     ▲                                                        │
     └──────────── email, roadmap, changelog ◄────────────────┘
                        (closing the loop)
```

The third loop is the one the product exists for: without it a portal is a wall of
wishes.

## Glossary

- **Board** — a top-level section of the portal: "Feature requests", "Bugs", "API".
- **Post / request** — a unit of incoming signal. It has a **type** (idea, bug,
  question), a status and votes.
- **Vote** — "I need this too" on an idea, "same here" on a bug. One person, one vote.
- **Severity** — how much it hurts, judged by the **reporter**. **Priority** — how much
  it matters, judged by the **team**. Two different fields that must not be merged.
- **Status** — the public stage of a request (`open → planned → building → completed`).
- **Backlog item** — an internal unit of work, linked N:M to requests, with its own
  internal stage that maps onto a public status.
- **Insight** — a quote from a user gathered outside the portal (a call, a ticket, a
  chat) attached to a request or an item.
- **Roadmap** — a public summary of requests by status across all boards.
- **Changelog** — a feed of releases linked back to the requests they closed.
- **Merge** — folding a duplicate into the main request, carrying over votes and
  subscribers.
