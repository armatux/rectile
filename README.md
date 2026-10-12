# rectile

Single-user, self-hosted project tracker PWA — a "mission control" for many
parallel hobby/engineering projects. It answers two questions:

1. **"Where did I leave off?"** — every project has a feature roadmap
   (planned / in progress / built) and a quick-capture log, and always shows
   its *next action*.
2. **"What is silently dying?"** — every project carries a last-touched
   timestamp that visually decays (subtle <7d → amber 7–21d → red >21d) plus
   a dedicated `/stale` radar sorted oldest-first.

Fully writable by an AI assistant via a bearer-token REST API and an MCP
server, so Claude can log progress, move roadmap items and open new projects
for you.

**Stack:** Next.js 15 (App Router, TS, server actions) · PostgreSQL 16 ·
Drizzle ORM · Tailwind CSS 4 · hand-rolled service worker PWA ·
Docker Compose · [`mcp-handler`](https://www.npmjs.com/package/mcp-handler).

---

## Pages

| Route | What |
| --- | --- |
| `/` | Dashboard grid: progress bar (built/total), status, tags, next action, staleness indicator, filters (status/tag/sort) + global search |
| `/p/[slug]` | Project detail: 3-column roadmap (drag between columns on desktop/iPad, one-tap status cycle on mobile, inline add), big progress header, markdown log with pinned quick-capture, links, tags, status/priority controls |
| `/stale` | All non-done projects, least recently touched first |
| `/tickets` | Vestige orchestrator tickets grouped by status (filter by owner agent); `/tickets/[key]` shows fields, event timeline, attachments, a comment box and owner-only Approve / Request changes / Cancel (confirm dialog) |
| `/search?q=` | Postgres full-text search across projects, features, log entries |

## Development

```bash
# 1. postgres (podman or docker)
podman run -d --name rectile-dev-pg \
  -e POSTGRES_USER=rectile -e POSTGRES_PASSWORD=rectile -e POSTGRES_DB=rectile \
  -p 127.0.0.1:5433:5432 docker.io/library/postgres:16-alpine

# 2. deps + schema + demo data
npm install
export DATABASE_URL='postgres://rectile:rectile@localhost:5433/rectile'
npm run db:migrate
npm run db:seed          # 3 example projects

# 3. run (API_TOKEN guards /api/*)
API_TOKEN=$(openssl rand -hex 32) npm run dev
```

Tests (auth + ticket-guard suites always run; the CRUD and tickets route
suites need `DATABASE_URL`):

```bash
DATABASE_URL='postgres://rectile:rectile@localhost:5433/rectile' npm test
```

Schema changes: edit `db/schema.ts`, then `npm run db:generate` and commit the
new file in `drizzle/`.

## Production deploy (Proxmox / any Docker host)

```bash
git clone git@github.com:armatux/rectile.git /opt/rectile && cd /opt/rectile
cp .env.example .env      # set POSTGRES_PASSWORD, API_TOKEN (openssl rand -hex 32), TUNNEL_TOKEN
docker compose up -d --build
```

That single command brings up Postgres, the app (migrates on boot), and the
Cloudflare Tunnel connector — the site is then live at https://armadax.xyz.

- **Migrations run automatically on boot** (instrumentation hook applies
  pending files from `drizzle/`; disable with `RECTILE_MIGRATE_ON_BOOT=0`).
- First boot with `RECTILE_SEED_DEMO=1` in `.env` inserts the 3 demo projects
  (only if the DB is empty). Set it back to `0` afterwards.
- App listens on `127.0.0.1:3000`, Postgres data lives in the `pgdata` volume.
- Health: `curl localhost:3000/healthz` (used by the compose healthcheck; it
  is deliberately *outside* `/api/` so it needs no token).

### Nightly backup (cron on the host)

```cron
0 3 * * * cd /opt/rectile && docker compose exec -T db pg_dump -U rectile rectile | gzip > /var/backups/rectile-$(date +\%F).sql.gz
```

Restore: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U rectile rectile`

### Cloudflare Tunnel (already configured, 2026-07-23)

The compose stack includes a `cloudflared` service that joins the
dashboard-managed tunnel **`proxmox`** using `TUNNEL_TOKEN` from `.env` —
no cloudflared install on the host needed. The tunnel's published
application route (Zero Trust → Networks → Tunnels & Mesh → proxmox) is:

- `armadax.xyz` (all paths) → `http://app:3000` (the app container, resolved
  on the compose network)

If you ever recreate the tunnel: make a new tunnel, copy its connector
token into `.env` as `TUNNEL_TOKEN`, and add the same published-application
route (service must be `http://app:3000`, not localhost, because cloudflared
runs as a sibling container).

### Cloudflare Access (already configured, 2026-07-23)

Browser access is protected by **Cloudflare Access in front of the tunnel** —
the app itself has **no login/user accounts** by design. Two self-hosted
Access applications exist on team `still-rice-163a`:

| App | Destination | Policy |
| --- | --- | --- |
| `rectile` | `armadax.xyz` | `owner-allow`: Allow → Emails: armatux@pm.me (one-time PIN) |
| `rectile-api` | `armadax.xyz/api` | `api-bypass`: **Bypass → Everyone** |

Access matches the most specific destination first, so `/api/*` (REST + MCP)
skips the login screen and is guarded **only** by the bearer token in
`middleware.ts` — requests without `Authorization: Bearer <API_TOKEN>` get
a 401. Never mount anything under `/api/*` that skips that check.

## REST API (`/api/v1/*`)

All requests need `Authorization: Bearer <API_TOKEN>` (or a per-actor token,
below). JSON in/out. Errors: `400` validation (with `issues[]`), `401` bad
token, `403` forbidden for this actor, `404` missing, `409` conflict, `500`
server.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/projects?status=&tag=&sort=` | sort: `staleness` (default) `priority` `name` `updated` `created` |
| POST | `/api/v1/projects` | `{name, description?, category?, status?, priority?, tags?[]}` |
| GET | `/api/v1/projects/:slug` | full detail: features, logs, links, tags |
| PATCH | `/api/v1/projects/:slug` | any subset of create fields; `tags` replaces the set |
| DELETE | `/api/v1/projects/:slug` | cascades |
| GET/POST | `/api/v1/projects/:slug/features` | `{title, description?, status?}` |
| PATCH/DELETE | `/api/v1/features/:id` | `{title?, description?, status?, sortOrder?}` — status→`built` stamps `completed_at`, bumps last-touched |
| GET/POST | `/api/v1/projects/:slug/logs` | `{body}` markdown; bumps last-touched |
| DELETE | `/api/v1/logs/:id` | |
| GET/POST | `/api/v1/projects/:slug/links` | `{label, url}` |
| PATCH/DELETE | `/api/v1/links/:id` | |
| GET/POST | `/api/v1/tags` | `{name, color?}` |
| PATCH/DELETE | `/api/v1/tags/:id` | |
| GET | `/api/v1/search?q=` | FTS across projects/features/logs |

```bash
curl -s -H "Authorization: Bearer $API_TOKEN" https://armadax.xyz/api/v1/projects
curl -s -X POST -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"body":"shipped the tunnel config"}' \
  https://armadax.xyz/api/v1/projects/my-project/logs
```

## Actors, tokens and tickets (Vestige orchestrator)

rectile is the source of truth for the Vestige agent orchestrator, which
polls and writes tickets with **per-actor bearer tokens**. Actors: `human`,
`orchestrator`, `code`, `visual`. `API_TOKEN` keeps working everywhere as
`human`.

```bash
npm run token:issue -- orchestrator "vestige orchestrator"   # prints rt_… once
npm run token:revoke -- 3
```

Only the SHA-256 of a token is stored. The scripts need `DATABASE_URL` (or
the `POSTGRES_*` vars) pointing at the database; the production image has
no `tsx`, so on the server use the human-only API instead:

```bash
curl -s -X POST -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"actor":"code","name":"code agent"}' https://armadax.xyz/api/v1/tokens
```

**How the actor reaches the handlers.** `middleware.ts` runs on the Node.js
runtime (stable in Next 15.5), resolves the bearer to an actor (env token →
`human`, `rt_…` → hashed lookup in `api_tokens`, `last_used_at` stamped at
most once a minute) and forwards it as `x-rectile-actor` /
`x-rectile-token-name` request headers plus an HMAC (keyed with
`API_TOKEN`) in `x-rectile-actor-sig`. Client-supplied copies are always
overwritten, and handlers verify the HMAC, so a request that somehow skipped
the middleware fails closed (401).

**Permissions.** `code`/`visual` may create tickets (triage only), add
`comment|question|handoff` events and attachments, and read everything; they
may not PATCH tickets, and outside the ticket endpoints they are read-only
(their writes to projects/logs/kv are refused with 403 — log markdown
renders unsanitized in the owner's browser). `orchestrator` may patch any
field and add any event type except `approval|rejection`, but cannot set
`changes_requested`, `approved` or `cancelled`. `human` may do everything.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/whoami` | `{actor, tokenName}` |
| GET/POST | `/api/v1/tokens` | human only; POST `{actor, name}` → `201 {token, rawToken}` (raw value shown once); GET never returns hashes |
| DELETE | `/api/v1/tokens/:id` | human only; revokes (keeps the row) |
| GET | `/api/v1/tickets?since_seq=&status=&owner=&updated_since=&limit=` | `{tickets, maxSeq}` ordered by `seq`; `since_seq` exclusive; limit 1–500 (200). Use `maxSeq` as the next `since_seq` |
| POST | `/api/v1/tickets` | `{title, ownerAgent, description?, kind?, source?, priority?, acceptanceCriteria?, touchedPaths?, linkedContracts?, model?, effort?, mode?, status?, projectSlug?}` → `201 {ticket}` |
| GET | `/api/v1/tickets/:key` | `{ticket, events, attachments}` |
| PATCH | `/api/v1/tickets/:key` | must include `version`; stale → `409 {error, ticket}`. Status changes write `status_change {from,to}`; `approved`/`changes_requested` also write `approval`/`rejection` with the optional `note` |
| GET/POST | `/api/v1/tickets/:key/events` | GET `?after_id=` → `{events}`; POST `{type, body, data?}` → `201 {event}` |
| POST | `/api/v1/tickets/:key/attachments` | `{label, url, sha256, contentType?, sizeBytes?}` → `201 {attachment}` |
| GET | `/api/v1/ticket-events?after_id=&limit=` | global feed `{events, maxId}`, each with `ticketKey`; limit 1–1000 (200) |

Every ticket write (and every event/attachment added to a ticket) takes the
next value of the global `ticket_change_seq`. Ticket writes are serialized
by a transaction-scoped advisory lock, so `seq` and event ids become
visible in order — a poller can never miss a row below a cursor it has seen.

## MCP server (`/api/mcp`)

Streamable-HTTP MCP endpoint exposing:
`list_projects` · `get_project` · `create_project` · `update_project` ·
`add_log_entry` · `add_feature` · `update_feature_status` · `search` ·
`list_tickets` · `get_ticket` · `create_ticket` · `comment_ticket`.
Same bearer tokens as the REST API (the middleware covers `/api/mcp` too);
tools act as the token's actor (`create_ticket` is triage-only unless the
caller is `human`; agent tokens cannot use the project-writing tools).

**Claude Code**

```bash
claude mcp add --transport http rectile https://armadax.xyz/api/mcp \
  --header "Authorization: Bearer <API_TOKEN>"
```

**Claude.ai / Claude apps (custom connector)**

Settings → Connectors → *Add custom connector* → URL
`https://armadax.xyz/api/mcp`. If your connector UI has no custom-header
field (it currently only offers OAuth), bridge it locally with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rectile": {
      "command": "npx",
      "args": [
        "mcp-remote", "https://armadax.xyz/api/mcp",
        "--header", "Authorization: Bearer <API_TOKEN>"
      ]
    }
  }
}
```

## PWA install (iPhone / iPad)

Open `https://armadax.xyz` in Safari → Share → **Add to Home Screen**. The
app runs standalone (black-translucent status bar, safe-area aware, ≥44px
touch targets). The service worker caches the app shell and falls back to
`/offline` without a connection; data always comes from the network.

## Notes

- Log entries render markdown (via `marked`) without HTML sanitization —
  acceptable in a single-user app where the only writers are you (behind
  Access) and your AI (behind the token).
- The DB connection prefers discrete `POSTGRES_*` vars over `DATABASE_URL`
  precisely so passwords with `?&#` characters need no URL-encoding.
- `next build` output is `standalone`; the runtime image contains only the
  traced server bundle, static assets and `drizzle/` migrations.
