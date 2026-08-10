# Client Handoff — Status White-Label Platform

This document transfers ownership of a deployed Status tenant instance to your team.

## Architecture overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App    │────▶│  Status API      │────▶│  PostgreSQL     │
│  (white-label)  │     │  (multi-tenant)  │     │  + RLS policies │
└────────┬────────┘     └────────┬─────────┘     └─────────────────┘
         │                       │
         │ X-Tenant-Slug         │ Redis namespace
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Theme JSON     │     │  Next.js Admin   │
│  (startup fetch)│     │  Dashboard :3100 │
└─────────────────┘     └──────────────────┘
```

Each tenant receives:
- Isolated PostgreSQL rows via `tenant_id` + Row-Level Security
- Dedicated Redis key namespace (`status:<slug>:`)
- Custom branding via `tenants.theme_config` JSON
- Per-tenant AI tuning via `tenants.ai_config` JSON

## Your tenant credentials

After provisioning with `scripts/provision_tenant.sh`, you receive:

| Item | Location |
|------|----------|
| Tenant slug | `deploy/tenants/<slug>.env` or `/etc/status/tenants/<slug>.env` |
| Mobile config | `mobile/.env.tenant.<slug>` |
| Dashboard config | `dashboard/.env.local` |
| DB tenant row | `tenants` table, slug = your identifier |

## Required environment variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DEFAULT_TENANT_SLUG` | Default tenant for requests without header |
| `JWT_SECRET` | Auth signing secret — rotate on handoff |
| `REDIS_URL` | Redis for cache/rate limits |
| `PORT` | API port (default 3000) |

### Flutter (`mobile/.env`)

| Variable | Description |
|----------|-------------|
| `TENANT_SLUG` | Your tenant identifier |
| `API_BASE_URL` | e.g. `https://api.yourdomain.com/api/v1` |
| `SOCKET_URL` | WebSocket base URL |

### Admin dashboard (`dashboard/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_TENANT_SLUG` | Your tenant slug |
| `NEXT_PUBLIC_API_BASE_URL` | API base URL |

## API usage

All requests must include the tenant header:

```http
X-Tenant-Slug: your-tenant-slug
Authorization: Bearer <jwt>   # for authenticated routes
```

### Key endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/tenant/theme` | GET | Public theme JSON (Flutter startup) |
| `/api/v1/tenant/theme` | PATCH | Update branding (admin) |
| `/api/v1/tenant/admin/characters` | GET | List characters for prompt tuning |
| `/api/v1/tenant/admin/users` | GET | User moderation list |

## Provisioning a new tenant (Ubuntu)

```bash
chmod +x scripts/provision_tenant.sh
./scripts/provision_tenant.sh acme-corp "Acme Corporation"
```

This script:
1. Applies database migrations (including RLS policies)
2. Creates the tenant record with theme/AI defaults
3. Registers an isolated Redis namespace
4. Writes environment snippets for API, Flutter, and dashboard

## Admin dashboard

```bash
cd dashboard
npm install
npm run dev   # http://localhost:3100
```

Panels:
- **Theme** — colors, app name, typography
- **Characters** — AI system prompt tuning
- **Moderation** — promote/revoke tenant admins

Authenticate with a JWT from an admin user (`is_admin = true`) in your tenant.

## Data isolation guarantees

1. **PostgreSQL RLS** — every query runs with `SET LOCAL app.tenant_id`
2. **Composite unique indexes** — `(tenant_id, username)` and `(tenant_id, email)`
3. **JWT tenant claim** — tokens include `tenantId`; mismatches rejected
4. **Middleware chain** — `tenantResolver` → `tenantScope` → `auth` → `validateUserTenant`

## Migration index

Apply through migration **019** (`019_phase25_multi_tenant.sql`) for tenant tables and RLS.

## Support checklist

- [ ] Rotate `JWT_SECRET` and `PQ_AUTH_PEPPER` after handoff
- [ ] Set production `DATABASE_URL` with SSL
- [ ] Configure CDN (`deploy/cdn/`) for your domain
- [ ] Run `./scripts/golden_master_audit.sh`
- [ ] Create first admin user and promote via dashboard
- [ ] Customize theme via dashboard → verify Flutter app reload

## Documentation index

| Document | Purpose |
|----------|---------|
| `README.md` | Full platform feature reference (Phases 1–25) |
| `docs/GOLDEN_MASTER.md` | Architecture diagrams, deploy topology |
| `MAINTENANCE.md` | Ongoing ops and monitoring |
| `DEPLOYMENT.md` | Server install steps |

---

*Generated for Phase 25 — White-Label SaaS Packaging & Client Handoff.*
