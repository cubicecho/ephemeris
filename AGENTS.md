# AGENTS.md — Ephemeris

## Project Overview

Ephemeris is a minimal daily journal: one entry a day, some words and a mood from
1 to 5. That is the whole product. One monorepo (npm workspaces) with three
packages — `app/` (frontend), `server/` (GraphQL API), `db/` (schema and
connection) — and one container serves all of it.

There are no tags, no search, no attachments, no reminders, no streaks. The mood
column exists so that **personal-dashboard** and **eunomia** can eventually
correlate how someone felt against what else their day contained; that
integration is not built here, and nothing in this repo reaches out to them.

## Tech Stack

| Layer    | Technology                                       |
| -------- | ------------------------------------------------ |
| Frontend | React 19, Vite 7, react-router, Apollo Client 4   |
| UI       | Tailwind CSS v4, shadcn/ui + cubeui, Radix UI     |
| API      | graphql-yoga 5 on Express 5, GraphQL              |
| Database | Drizzle ORM + PostgreSQL (`postgres-js`)          |
| Testing  | Vitest, PGlite as an in-memory Postgres fixture   |
| Linting  | Biome (formatter + linter)                        |
| Runtime  | Node.js 24+, ESM (`"type": "module"` throughout)  |

## Project Structure

```
ephemeris/
├── app/                     # Frontend (Vite SPA, built to app/dist)
│   └── src/
│       ├── __generated__/   # Generated GraphQL types (do not edit, not committed)
│       ├── components/
│       │   ├── ui/          # shadcn/ui primitives — vendored, not linted
│       │   ├── layouts/     # app-layout: the sidebar + header chrome
│       │   ├── domain/      # recent-days, theme-select
│       │   └── *.tsx        # cubeui shells (PageHeader, CardLayout, QueryState, …)
│       ├── routes/          # login, verify, journal (the one page)
│       ├── lib/             # apollo, auth, query, date, mood, cn()
│       └── main.tsx         # Providers + the router
├── server/                  # GraphQL API (port 3005)
│   ├── __generated__/       # Generated SDL (not committed)
│   └── src/
│       ├── index.ts         # Entry point: migrate, mount /graphql, serve the SPA
│       ├── preflight.ts     # Boot guards — imported first, on purpose
│       ├── config.ts        # Every env var, read at call time
│       ├── build-schema.ts  # createSchema(db) — buildSchema + extensions
│       ├── tenancy.ts       # Row scope, server-owned columns and which writes exist
│       ├── resolvers/
│       │   ├── auth.ts          # Magic-link sign-in — the one thing that is not CRUD
│       │   └── write-guards.ts  # onWrite hook: the mood scale and the body limit
│       └── __tests__/       # Server tests
├── db/
│   ├── drizzle/             # Generated migrations (committed)
│   └── src/
│       ├── models/          # users, entries
│       ├── relations.ts     # defineRelations config (drives the GraphQL schema)
│       └── index.ts         # DB singleton + re-exports
├── Dockerfile               # node:24-alpine; the `test` stage runs the suite
├── docker-compose.dev.yml   # Infrastructure only — Postgres. Never the app.
├── .env.local.example       # Per-machine overrides; how to develop against docker.lan
└── docker-compose.yml       # The whole stack, built from this checkout
```

## Commands

```bash
npm run dev              # server (3005) + Vite dev server (3000, proxies /graphql)
npm run db:up            # Postgres on this machine, 127.0.0.1:5437
npm run db:up:lan        # the same file on the docker.lan host, published on its LAN address
npm run db:generate      # new migration from a schema change
npm run db:migrate       # apply migrations
npm run codegen          # GraphQL types for both server and app
npm run check            # codegen + biome + tsc --noEmit, all three workspaces
npm test                 # Vitest
```

`npm run check` is the gate. Run it before saying a change is done.

## How the API is built

**The GraphQL schema is generated from the Drizzle schema.** There are no
hand-written CRUD resolvers: `buildSchema(db, config)` from
`@vantreeseba/drizzle-graphql` produces queries, filters, aggregates, relation
fields and — here — the writes too, for every table in `db/src/relations.ts`.

- **`relations.ts`, not `schema.ts`, is what the library reads.** A table with no
  entry there gets no relation fields.
- **Generated writes are on for `entries` and off for `users`.** `features` in
  `tenancy.ts` is a per-table predicate. A journal entry genuinely is CRUD; a
  user row is created by signing in and by nothing else.
- **`upsert` is not on by default — this app turns it on**, and that single
  feature flag is the reason there is no hand-written `saveEntry`. See the
  invariant below.
- **Only what CRUD cannot express gets a resolver.** That is `resolvers/auth.ts`,
  and nothing else. `resolvers/write-guards.ts` is not a resolver: it is an
  `onWrite` hook on the generated mutations.
- **Ids are `UUID`, not `ID`.** The generated scalar, and what hand-written SDL
  has to declare too, or a variable will not typecheck against it.

## Rules that carry weight

**One entry per person per day, enforced in three places that must agree.** The
unique constraint `uq_entries_user_date` on `(user_id, entry_date)`, the
`upsertEntry` conflict target `[userId, entryDate]` in `routes/journal.tsx`, and
the `key={date}` that remounts the page when the day changes. The client never
asks whether today already has an entry — it saves, and the conflict target
decides whether that was an insert or an edit. Change the constraint and the
mutation silently starts writing duplicate days.

**`userId` is stamped, never accepted — but it is still statable as a conflict
target.** `contextValues` in `tenancy.ts` removes `userId` from the generated
Create and Update inputs and fills it from the session. It does *not* remove it
from `EntryConflictTarget` (only `exclude` would), which is exactly what makes
`onConflict: { target: [userId, entryDate] }` expressible by a client that has no
way to say what its own user id is. This is load-bearing; `entries.test.ts` has a
case for each half.

**Every table needs a `scope` entry.** `server/src/tenancy.ts` maps each table to
a `RowScope` that is ANDed into the SQL of every generated read, update and
delete. A table missing from `scope` is visible across tenants, and nothing else
in the code will say so. `tenancy.test.ts` fails when you forget — do not delete
the test to make it pass.

**A journal day is a calendar day, not an instant.** `entryDate` is a Postgres
`date` in `{ mode: 'string' }`, so it crosses the wire as `YYYY-MM-DD` in both
directions and is never converted to a timestamp. On the client, every date goes
through `app/src/lib/date.ts`, which works in local calendar parts only — because
`new Date('2026-09-15')` parses as **UTC** midnight, which is the 14th for anyone
west of Greenwich, and that bug shows up as "yesterday's entry is today's".
`codegen.ts` maps the `Date` scalar to `string` for the same reason.

**The mood scale lives in three places and is 1–5 in all of them.** The check
constraint `ck_entries_mood_range` in `db/src/models/entries.ts`, `MOOD_MIN` /
`MOOD_MAX` in `server/src/resolvers/write-guards.ts`, and `MOODS` in
`app/src/lib/mood.ts`. The database is the guarantee; the hook exists only so a
caller who sent `6` is told the scale rather than handed `violates check
constraint`. Widening the scale means all three.

**`mood` is `integer`, not the `smallint` the range would justify.**
drizzle-graphql maps `PgInteger` to `Int` and lets `smallint` fall through to
`Float`. A mood of `3.5` that typechecks is a worse trade than two bytes a row.

**`mood` is nullable and that is not an oversight.** A day someone wrote about
without rating is a complete entry. Anything consuming this data for correlation
has to treat "not recorded" as absent, not as a middling 3.

**The `onWrite` hook runs inside the mutation's transaction.** A throw rolls the
write back, so there is no window between the check and the write. `writtenRows`
normalises the four shapes a write can arrive in (`values` as a row or a list,
`set`, `updates[].set`); a delete writes nothing and is not checked.

**`SECURE_LOCAL_NET` is the ecosystem's word for a trusted network**, and here it
means sign-in needs no link: `requestMagicLink` returns a live session for
whatever address it is handed, and the login page uses it (`if (result.token)`).
`AUTH_MAGIC_LINK=false` is the older, narrower spelling and still works;
`magicLinkRequired()` in `config.ts` is where the two meet. Both make an email
address the entire credential, so neither belongs on a reachable instance.
Ephemeris ships no mail provider — `EXPOSE_MAGIC_LINK` returns the link in the
response so a single-user instance can sign in at all.

**`UNAUTHENTICATED` means the session expired.** The client drops its token on it
and redirects to `/login`. A bad magic link is `BAD_USER_INPUT` — it must not
sign anyone out.

**Every day is a URL.** `/` only ever redirects to today; the page itself lives
at `/:date`. A date that is not a real calendar day redirects to today rather
than erroring, so a hand-typed or stale URL is never a dead end. This is what
makes a row in "Recent" a plain `<Link>`.

**An empty state means the server said "none", never that we failed to ask.**
`QueryState` takes the failure rung before the empty one, and `queryLike()` in
`app/src/lib/query.ts` reports pending and error only while there is nothing on
screen.

**Forms are `FormField` + `useState`, not TanStack Form.** cubeui's form skill
assumes every consuming project runs TanStack Form; `FormField` deliberately
takes its props structurally so that it does not have to. Engrafo — the newest
sibling — uses plain state, and one textarea and one radio group is not a reason
to disagree with it. A form here with real validation across fields would be.

**Both `db:up` scripts name their Docker context, and that is not decoration.**
`db:up` pins `default`, `db:up:lan` pins `docker.lan`. With a remote context
*active* — which it is on the machine this was built on — an unpinned
`docker compose up` publishes Postgres on the **remote host's** `127.0.0.1`,
where nothing can reach it, and `db:migrate` fails with `ECONNREFUSED` against a
container that is demonstrably running. `db:up:lan` also sets `DEV_BIND=0.0.0.0`,
which is the only way a laptop reaches a database on another host, and is why
`POSTGRES_PASSWORD` is overridable in `docker-compose.dev.yml`.

**`.env.local` overrides `.env`, and the load order is inverted between the two
mechanisms.** `--env-file-if-exists` is *last*-wins, so the package scripts list
`../.env` then `../.env.local`. `process.loadEnvFile` leaves an already-set
variable alone, so it is *first*-wins, and `server/src/preload-env.ts`,
`db/drizzle.config.ts` and `app/vite.config.ts` all load `.env.local` **first**.
Getting either one backwards silently ignores the override. Neither beats a real
exported shell variable, which is the behaviour you want.

**The `Date` scalar is mapped to `string` in `app/codegen.ts` on purpose.** It
serialises to a `YYYY-MM-DD` string — JSON has no date type and Apollo does not
parse custom scalars — so `Date` would be a type that typechecks
`.getFullYear()` and throws. Upstream only half-applies the scalar: the same
column is `Date` on output, `String!` on input and `StringFilter` in a filter.
Tracked at https://github.com/cubicecho/drizzle-graphql/issues/174; if that
lands, revisit this mapping and the `$date: String!` variables in
`routes/journal.tsx` together.

**The theme is a device preference, not an account setting.** `app/src/lib/theme.ts`
owns it: `system | light | dark` in `localStorage` under `ephemeris_theme`,
applied by putting `.dark` on `<html>` — which is what `@custom-variant dark
(&:is(.dark *))` in `index.css` is keyed on. It never touches the API, because a
signed-out login page has a theme too, and because the same person wants dark on
a laptop at night and light on a desk monitor. **`index.html` duplicates the key
and the rule in a blocking inline script**, deliberately: a module import runs
after first paint, which is a white flash for a dark-theme reader. The two copies
must agree. Every storage access is wrapped — `localStorage` *throws* in a
private window with site data blocked, and a theme is never worth a blank page.

**cubeui ships no theme component** (`PageLayout` says in as many words that the
theme toggle is not its job), so the control is `ThemeSelect`, a cubeui
`OptionSelect` over the three values. It lives in the sidebar footer beside sign
out, which is where the mcp-* apps put theirs, and in the `footer` slot of the
login card so that it works signed out. Icon *and* word — three states cannot be
read off one icon.

**`vitest.setup.ts` shims `localStorage`.** Node 24 defines a `localStorage`
global of its own which is inert without `--localstorage-file` and which shadows
the one jsdom builds, so in the `dom` project `window.localStorage` is
`undefined` and anything device-remembered silently exercises only its
storage-unavailable branch. Also note the two Vitest projects: `app/src/lib/**/*.test.ts`
runs under **node**, so a lib test that needs a DOM must be named `.test.tsx`.

**The chrome matches the mcp-* apps, deliberately.** `components/layouts/app-layout.tsx`
is the same shell as `mcp-router`, `mcp-skills-manager` and `mcp-zeromem`: a
`w-56` sidebar on `bg-sidebar` with a `border-r`, an `h-14` bordered header with
a compact nav on the left and a status line on the right, and a
`flex-1 overflow-auto p-4 md:p-6` body. `index.css` carries the same tokens in
the same order, including the `--sidebar-*` set, and nothing here overrides the
body font — these are meant to read as one set of tools. A page inside it is a
`flex max-w-2xl flex-col gap-6` column, which is what those apps' prose pages are.

What differs is only what fills the rail. Those apps have sections; a journal has
days, so the rail lists the days and `RecentDaysNav`/`RecentDaysList` are the
same thirty rows drawn twice — as rail links, and as cards for the widths with no
rail. Both read one `RecentEntries` document, so the second costs nothing, and
**a write has to refetch it as well as `JournalDay`** or the rail goes stale.

**The rail and the mobile bar are the same navigation twice.** A browser shows
one of them — `hidden` is `display: none`, so the other is out of the
accessibility tree too — but jsdom applies no stylesheet and sees both. Scope
every query in a shell test to a landmark (`complementary` for the rail, `banner`
for the header) or it matches twice.

**`app/src/components/ui/` is vendored.** Those files come from the shadcn and
cubeui registries and are kept as published, so `shadcn add` can update them.
`biome.json` exempts them from two lint rules rather than letting anyone edit
them into compliance. The cubeui shells one level up (`page-layout.tsx`,
`query-state.tsx`, …) are the same deal. Both take a **`content` prop, never
children**.

**The cubeui registry ships primitives that import `cn` from an npm package.**
After `shadcn add`, run
`sed -i 's|from "cn"|from "@/lib/utils"|' src/components/ui/*.tsx` and
`npm pkg delete dependencies.cn`.

## Where this is going

Ephemeris is meant to be read by **personal-dashboard** (Hive Gateway federation,
apps registered as `PLUGIN_<NAME>_URL`) and eventually correlated by **eunomia**.
Nothing here depends on either, and the forward compatibility is entirely in the
shape of the data: one row per person per day, with a small integer on it. Keep
it that way — a mood stored as a string, or two entries for one day, is what
would make the correlation impossible later.

## Code style

- Biome, single quotes, 2-space indent, 120 columns, trailing commas. `npm run check:fix`.
- `biome.json` is parsed as strict JSON here — **no comments in it**, or Biome
  reports a confusing "nested root configuration" error.
- `server/` and `db/` run under `--experimental-strip-types` with no build step,
  so **relative imports there carry an explicit `.ts` extension**. `app/` is
  bundled by Vite and omits it.
- **Never add `--preserve-symlinks`.** It resolves `@cubicecho/ephemeris-db` to
  its path inside `node_modules`, and Node refuses to strip types from anything
  under there.
- `import './preflight.ts';` stays first in `server/src/index.ts`, separated by a
  blank line so Biome's import sorting leaves it there. It has to run before
  `@cubicecho/ephemeris-db` is imported.
- Comments explain *why*. The code already says what.

## Generated output

`server/__generated__/`, `app/src/__generated__/` and `.env` are never committed.
Run `npm run codegen` after any schema change; CI regenerates from scratch.

## Git conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, …). semantic-release reads them.
- **Do not add `Co-Authored-By` trailers.**
- Never commit `.env`, generated code, or `node_modules`.
