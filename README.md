# Ephemeris

A minimal daily journal. One entry a day, a mood with it, and nothing else.

Open it and you are on today. Write what happened, optionally say how the day
was on a scale of 1 to 5, and save. Tomorrow is a different URL. Saving the same
day twice edits the entry you already had — the day is the key, so there is
never a second entry for it.

- **One page** — `/2026-09-15` is a day. `/` is today. The last thirty days you
  wrote about are the sidebar, each a link; on a phone they are listed under the
  editor instead.
- **A mood, if you want one** — 1 to 5, or not recorded. The only structured
  field in the whole app, and the only one anything else will ever read.
- **Sign-in by magic link**, or no link at all on a private instance.
- **Light, dark or whatever the system is** — chosen per device, remembered in
  the browser, applied before the first frame so there is no white flash.

No tags, no search, no attachments, no reminders, no streaks, no export yet.

Ephemeris exists to be a data source as much as an app: one row per person per
day, with a small integer on it, so that
[personal-dashboard](../personal-dashboard) and eunomia can eventually put mood
next to everything else a day contained. None of that is built here, and nothing
in this repo reaches out to them.

## Quickstart

Two containers: Ephemeris and Postgres. The app and the API are served from the
same origin.

```bash
git clone https://github.com/cubicecho/ephemeris.git
cd ephemeris

export JWT_SECRET=$(openssl rand -hex 32) POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose up --build -d
```

Ephemeris is then on `http://localhost:3005`. Migrations run at boot, so there is
no setup step. Sign in with any email address; Ephemeris ships no mail provider,
so the magic link goes to the log, and that is the delivery channel:

```bash
docker logs -f ephemeris-app-1
```

Keep that `JWT_SECRET`. It signs sessions, so changing it signs everyone out.
Your entries live in the `ephemeris_pgdata` volume and survive
`docker compose down`.

Read [**Before you expose it**](#before-you-expose-it) before putting this on a
domain.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** Postgres connection string. |
| `JWT_SECRET` | — | **Required in production.** Signs session and magic-link tokens. `openssl rand -hex 32`. |
| `APP_URL` | `http://localhost:$PORT` | Public URL; magic-link URLs are built from it. |
| `PORT` | `3005` | Port the server listens on. |
| `MAX_BODY_CHARS` | `65536` | Longest entry accepted, in characters — roughly 10,000 words. |
| `SECURE_LOCAL_NET` | `false` | `true` on a network with nothing hostile on it: an address alone signs you in, no link to fetch. |
| `AUTH_MAGIC_LINK` | `true` | The narrower spelling of the same thing: `false` turns the link off and leaves everything else alone. |
| `EXPOSE_MAGIC_LINK` | dev only | Return the magic link in the API response so the login page can show it. |

## Before you expose it

Registration is **open**: any address that completes a sign-in gets an account.
That is the right default for an instance only you can reach, and the wrong one
for an instance on the public internet. A journal is also about as personal as
self-hosted data gets. Before putting Ephemeris on a domain:

- **Put it behind something.** A reverse proxy with TLS, and — if the instance is
  yours alone — an allowlist, VPN, or auth in front of it. Ephemeris rate-limits
  sign-in requests per address in process; per-IP limiting is the proxy's job,
  because the proxy is the only thing that reliably knows the client's address.
- **Never set `SECURE_LOCAL_NET=true` (or `AUTH_MAGIC_LINK=false`) on a reachable
  instance.** Either one makes an email address the entire credential: anyone who
  can load the login page can sign in as anyone. They are for a LAN you control,
  which is the only place "secure local net" is a true statement.
- **Never set `EXPOSE_MAGIC_LINK=true` on a reachable instance.** It hands the
  sign-in token to whoever asked for it, which is the same thing by another route.
- **Set a real `JWT_SECRET`** and keep it. Changing it signs everyone out; leaking
  it lets anyone mint a session.

## Development

```bash
cp .env.example .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env

npm install
npm run db:up          # Postgres on 127.0.0.1:5437
npm run db:migrate
npm run codegen
npm run dev            # API on 3005, Vite dev server on 3000
```

Open <http://localhost:3000>. The dev server proxies `/graphql` to the API, and
outside production the magic link comes back in the response, so the login page
offers it as a link.

`npm run check` runs codegen, Biome and `tsc --noEmit` across all three
workspaces; `npm test` runs the suite against an in-memory Postgres. See
[AGENTS.md](AGENTS.md) for how the pieces fit together.

### Running the database on another host

`docker-compose.dev.yml` starts infrastructure and nothing else — Postgres, and
whatever else gets added later. The app is never in it: you run that from source.
So the database can live on a homelab box while `npm run dev` stays on your
laptop.

```bash
cp .env.local.example .env.local   # DATABASE_URL pointing at docker.lan
npm run db:up:lan                  # the same compose file, on the docker.lan daemon
npm run db:migrate
npm run dev                        # still local: API on 3005, Vite on 3000
```

`.env.local` is read after `.env` and wins, so `.env` stays as it came from
`.env.example` and `.env.local` holds only what differs. It is gitignored. A real
exported shell variable still beats both.

`db:up:lan` sets `DEV_BIND=0.0.0.0`, because a container on another host that
binds *that host's* loopback is not reachable from yours. That does put an
unencrypted Postgres on your LAN, so set `POSTGRES_PASSWORD` to something real if
the LAN is not one you fully control, and put it in `DATABASE_URL` to match.

Both scripts name their Docker context — `db:up` pins `default`, `db:up:lan` pins
`docker.lan` — so neither depends on which one `docker context ls` happens to
show as active. If you see `Cannot reach Postgres` from a container that is
plainly running, an unpinned `docker compose` somewhere is the usual reason.

## The API

Everything except sign-in is generated from the Drizzle schema by
[`@vantreeseba/drizzle-graphql`](https://github.com/vantreeseba/drizzle-graphql).
GraphiQL is at `/graphql` outside production. Saving a day is one mutation:

```graphql
mutation SaveEntry($date: String!, $body: String!, $mood: Int) {
  upsertEntry(
    values: { entryDate: $date, body: $body, mood: $mood }
    onConflict: { target: [userId, entryDate], update: [body, mood] }
  ) {
    id
    entryDate
    body
    mood
  }
}
```

`userId` is never sent: the server stamps it from the session, and every read is
scoped to the caller in SQL rather than by a resolver.

### Reading it from somewhere else

Ephemeris is a plain GraphQL API on `/graphql`, so a dashboard can register it
the way the rest of the ecosystem does:

```bash
PLUGIN_EPHEMERIS_URL=http://localhost:3005/graphql
```

`entries(orderBy: { entryDate: { direction: desc, priority: 1 } }) { entryDate mood }`
is the whole correlation surface. `mood` is null for a day that was written
about but not rated, which is not the same as a middling 3.

## License

[MIT](LICENSE) © Benjamin Van Treese
