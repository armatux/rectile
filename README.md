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

Tests (auth middleware always runs; the CRUD suite needs `DATABASE_URL`):

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

All requests need `Authorization: Bearer <API_TOKEN>`. JSON in/out.
Errors: `400` validation (with `issues[]`), `401` bad token, `404` missing,
`409` conflict, `500` server.

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

## MCP server (`/api/mcp`)

Streamable-HTTP MCP endpoint exposing:
`list_projects` · `get_project` · `create_project` · `update_project` ·
`add_log_entry` · `add_feature` · `update_feature_status` · `search`.
Same bearer token as the REST API (the middleware covers `/api/mcp` too).

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
