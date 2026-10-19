# Ephemeris

A minimal daily journal. One entry a day, a mood with it, and nothing else.

**Site:** <https://cubicecho.github.io/ephemeris/>

Open it and you are on today. Write what happened, optionally say how the day
was on a scale of 1 to 5, and save. Tomorrow is a different URL. Saving the same
day twice edits the entry you already had — the day is the key, so there is
never a second entry for it.

- **One page** — `/2026-09-15` is a day. `/` is today. The last thirty days you
  wrote about are the sidebar, each a link; on a phone they are listed under the
  editor instead.
- **A mood, if you want one** — 1 to 5, or not recorded. The only structured
  field in the whole app, and the only one anything else will ever read.
- **Sign-in by magic link or an OpenID Connect provider** (heautou, Keycloak,
  Authentik, …), paired from the login page by pasting one URL — or no link at
  all on a private instance.
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

export BETTER_AUTH_SECRET=$(openssl rand -hex 32) POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose up -d
```

That runs the published image, `ghcr.io/cubicecho/ephemeris:latest`. Add
`--build` to build the checkout instead.

Ephemeris is then on `http://localhost:3005`. Migrations run at boot, so there is
no setup step. Sign in with any email address; Ephemeris ships no mail provider,
so the magic link goes to the log, and that is the delivery channel:

```bash
docker compose logs -f ephemeris
```

Keep that `BETTER_AUTH_SECRET`. Sessions are rows in Postgres, but the OIDC
sign-in's state and one-time tokens are signed with it. Your entries live in the `ephemeris_pgdata` volume and survive
`docker compose down`.

Read [**Before you expose it**](#before-you-expose-it) before putting this on a
domain.

## Signing in

Sign-in is [better-auth](https://www.better-auth.com), with its sessions in
Postgres. There is no password, ever. Three ways in, and the login page shows
only the ones this instance offers:

- **A magic link.** Type an address and a link is sent to it; it works once, for
  15 minutes. Ephemeris ships no mail provider, so "sent" means written to the
  server's log. `EXPOSE_MAGIC_LINK=true` (the default outside production) also
  hands it back to the login page, which is how a single-user instance signs in
  without reading the log.
- **An OpenID Connect provider.** A *Sign in with …* button that goes to the
  provider and comes back signed in. The account is matched by the address the
  provider vouches for, so an existing account keeps its days.
- **The address alone**, under `SECURE_LOCAL_NET=true` (or the narrower
  `AUTH_MAGIC_LINK=false`), on a network with nothing hostile on it.

### Pairing a provider

The easy way needs no configuration. On a new instance — no accounts yet — the
login page offers **Set up sign-in with a provider**: paste the setup URL your
provider's admin made for Ephemeris (`<issuer>#setup=<token>&name=<name>`; heautou
generates one). Ephemeris registers itself with the provider by Dynamic Client
Registration (RFC 7591), keeps the client it gets back in Postgres, and the
button appears without a restart.

Anyone may pair while there are no accounts, so whoever installs it can set
sign-in up first. The first account to sign in becomes the instance's admin, and
after that only the admin may pair or disconnect a provider (`pairSso` /
`unpairSso`). Disconnecting deletes the client at the provider (RFC 7592).

The other way is the environment: `OIDC_ISSUER` and `OIDC_CLIENT_ID` (and
`OIDC_CLIENT_SECRET` for a confidential client) pin the provider, which then wins
over any pairing and cannot be changed from the app. Register the redirect URI
the server prints at boot with the provider: `<SERVER_URL>/api/auth/callback/oidc`.

Upgrading from a release before better-auth signs everyone out once: the old
sessions were signed tokens, and there is no table they could be carried into.
Accounts and entries are kept, and the earliest existing account becomes the
admin.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** Postgres connection string. |
| `BETTER_AUTH_SECRET` | — | **Required in production**, at least 32 characters. What better-auth signs with. `openssl rand -hex 32`. `JWT_SECRET`, the older name, is still read when this is unset. |
| `APP_URL` | `http://localhost:$PORT` | Public URL; magic links and the OIDC sign-in's landing page are built from it. |
| `SERVER_URL` | `APP_URL` in production | Where a browser reaches the server, for the OIDC sign-in's start and callback. Only differs from `APP_URL` in development. |
| `PORT` | `3005` | Port the server listens on. |
| `MAX_BODY_CHARS` | `65536` | Longest entry accepted, in characters — roughly 10,000 words. |
| `SECURE_LOCAL_NET` | `false` | `true` on a network with nothing hostile on it: an address alone signs you in, no link to fetch. |
| `AUTH_MAGIC_LINK` | `true` | The narrower spelling of the same thing: `false` turns the link off and leaves everything else alone. |
| `EXPOSE_MAGIC_LINK` | dev only | Return the magic link in the API response so the login page can show it. |
| `I_KNOW_SECURE_LOCAL_NET_IS_PUBLIC` | `false` | `SECURE_LOCAL_NET` (or `AUTH_MAGIC_LINK=false`) with an `APP_URL` that is not a private address stops the boot; `true` says that is on purpose. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID` | — | Pin an OpenID Connect provider. Both or neither. Unset, a provider can be [paired from the login page](#pairing-a-provider). |
| `OIDC_CLIENT_SECRET` | — | The client's secret. Unset, it is a public client and PKCE carries it. |
| `OIDC_CLIENT_AUTH` | `client_secret_basic` | How the secret is sent: `client_secret_basic` or `client_secret_post`. |
| `OIDC_NAME` | `SSO` | What the login page's button calls the provider. |
| `TRUST_PROXY` | `false` | The proxies in front that may set `X-Forwarded-For`: `1` for one reverse proxy, or `loopback`, `uniquelocal`, or a list of addresses. The sign-in throttle counts by client address. |
| `DB_CONNECT_TIMEOUT_MS` | `60000` | How long boot waits for Postgres before giving up. |

A connection to a public database host uses TLS. A loopback, LAN or compose
host does not, and an explicit `sslmode` in `DATABASE_URL` decides it either way.
`/healthz` answers 200 while Postgres does, and 503 when it does not.

## Before you expose it

Registration is **open**: any address that completes a sign-in gets an account.
That is the right default for an instance only you can reach, and the wrong one
for an instance on the public internet. A journal is also about as personal as
self-hosted data gets. Before putting Ephemeris on a domain:

- **Put it behind something.** A reverse proxy with TLS, and — if the instance is
  yours alone — an allowlist, VPN, or auth in front of it.
- **Set `TRUST_PROXY` to match that proxy** (`1` for a single one). Sign-in is
  rate-limited per client address and per email, and behind a proxy every
  request carries the proxy's address until this says otherwise. Never `true`
  on a port the internet can reach: a client could then choose its own address.
- **Never set `SECURE_LOCAL_NET=true` (or `AUTH_MAGIC_LINK=false`) on a reachable
  instance.** Either one makes an email address the entire credential: anyone who
  can load the login page can sign in as anyone. They are for a LAN you control,
  which is the only place "secure local net" is a true statement. The server
  refuses to start with either one and an `APP_URL` that is not a private
  address.
- **Never set `EXPOSE_MAGIC_LINK=true` on a reachable instance.** It hands the
  sign-in token to whoever asked for it, which is the same thing by another route.
- **Set a real `BETTER_AUTH_SECRET`** and keep it. Leaking it lets anyone forge
  what better-auth signs.
- **Sign in once before you expose it.** The first account is the admin, and
  until there is one anybody who can load the login page may pair the instance
  with a provider of their own.

## Development

```bash
cp .env.example .env
sed -i "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/" .env

npm install
npm run db:up          # Postgres on 127.0.0.1:5437
npm run db:migrate
npm run codegen
npm run dev            # API on 3005, Vite dev server on 3000
```

Open <http://localhost:3000>. The dev server proxies `/graphql` to the API, and
outside production the magic link comes back in the response, so the login page
offers it as a link. To try a provider in development, set
`APP_URL=http://localhost:3000` so the sign-in lands back on Vite; the dev server
proxies the server's `/sso` and `/api/auth` paths too.

`npm run check` runs codegen, Biome and `tsc --noEmit` across all three
workspaces; `npm test` runs the suite against an in-memory Postgres, and then
every Storybook story in a headless Chromium (`npx playwright install chromium`
once per machine). `npm run storybook` opens the stories on port 6006. See
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
