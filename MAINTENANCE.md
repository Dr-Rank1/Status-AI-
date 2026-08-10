# Status Platform — Maintenance & Hand-Off Guide

Operational reference for deploying, monitoring, and extending the Status monorepo through **Phase 24 (Golden Master)**.

## Deployment topology

```
                    ┌─────────────────┐
                    │  Flutter Client │
                    │  mobile/        │
                    └────────┬────────┘
                             │ HTTPS / WSS
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Status API │  │  Socket.IO │  │ Public API │
     │ :3000      │  │  realtime  │  │ /api/v1/   │
     └─────┬──────┘  └────────────┘  │ public     │
           │                         └────────────┘
     ┌─────┴──────────────────────────────────┐
     │ PostgreSQL (pgvector) │ Redis │ Kafka  │
     └────────────────────────────────────────┘
           │
     ┌─────┴─────┐     ┌──────────┐
     │ vLLM :8000│     │ IPFS pin │
     └───────────┘     └──────────┘
```

| Component | Path / service | Notes |
|-----------|----------------|-------|
| API server | `backend/src/index.js` | Express + Socket.IO |
| Database | PostgreSQL 16+ | Migrations in `backend/db/migrations/` |
| Cache | Redis | Feed cache, rate limits |
| Event bus | Redpanda/Kafka | Optional — energy/reputation events |
| Self-hosted LLM | `deploy/vllm/` | Llama 3 via OpenAI-compatible API |
| Metrics | `GET /metrics` | Prometheus scrape |
| Developer portal | `GET /api/docs` | Swagger UI (public API) |

## Environment tiers

| Tier | Purpose | Key overrides |
|------|---------|----------------|
| Development | Local docker-compose | `AI_PROVIDER=mock`, `IPFS_MOCK_MODE=true` |
| Staging | Pre-prod + Chaos Mesh | `SENTRY_DSN`, `POSTHOG_API_KEY` |
| Production | HA multi-region | `JWT_SECRET`, `ZKP_PEPPER`, `FEDERATED_AGGREGATION_KEY` |

## Database migrations

```bash
cd backend
./scripts/run-migrations.sh
```

Apply through `018_phase24_affective_mesh_metaverse.sql` for Phase 24 tables (affective biometrics, mesh sessions, metaverse sync).

## Scheduled jobs

| Cron name | Default | Purpose |
|-----------|---------|---------|
| `autonomous-ai-posts` | `0 */4 * * *` | Character feed posts |
| `narrative-events` | `0 12 * * *` | Global narrative + webhooks |
| `energy-daily-reset` | `0 0 * * *` | Daily energy reset |
| `fine-tuning-export` | `0 3 * * 0` | JSONL training export |
| `agent-tip-sweep` | `0 */6 * * *` | Autonomous micropayments |

Disable all: `CRON_ENABLED=false`

## AI architecture (Phase 21)

1. **Router** (`backend/src/services/ai/router.js`) — selects vLLM / Gemini / Anthropic
2. **Multi-agent coordinator** — parallel research + tools subagents, then dialogue synthesis
3. **Legacy agent workflow** — single-window tool calling when `MULTI_AGENT_ENABLED=false`
4. **Circuit breakers** — per-provider fallback to cache/mock

## Federated learning loop

1. Device trains local 32-dim preference vector (`FederatedLearningService`)
2. Client encrypts weights → `POST /api/v1/public/federated/submit`
3. Server aggregates open round → updates `federated_global_weights`
4. Client pulls global baseline → `GET /api/v1/public/federated/weights`

**Never commit** `FEDERATED_AGGREGATION_KEY` or `FEDERATED_SYNC_KEY` to git in production.

## Public developer API

1. Authenticated user registers client: `POST /api/v1/developers/clients`
2. Exchange token: `POST /api/v1/public/oauth/token` (`client_credentials`)
3. Call scoped endpoints with `Authorization: Bearer …`
4. Register webhooks: `POST /api/v1/public/webhooks`

Interactive docs: **http://localhost:3000/api/docs**

## Monitoring checklist

- [ ] `/api/v1/health/ready` returns 200
- [ ] `/metrics` scraped by Prometheus
- [ ] Sentry receiving backend + Flutter errors
- [ ] PostHog feature flags resolving
- [ ] Redis connected (feed cache hit rate)
- [ ] vLLM `/v1/models` healthy (if self-hosted)

## Backup & recovery

```bash
./scripts/backup.sh          # PostgreSQL dump
deploy/status-backup.cron      # Production schedule
```

Restore: apply latest dump, run migrations, redeploy backend systemd unit (`deploy/status-backend.service`).

## Security rotation schedule

| Secret | Rotation |
|--------|----------|
| `JWT_SECRET` | Quarterly — invalidates sessions |
| `ZKP_PEPPER` | Annually — invalidates outstanding proofs |
| OAuth client secrets | On compromise — rotate via new client |
| `FEDERATED_AGGREGATION_KEY` | Major version bump only |

---

## Hand-off checklist

### Repository

- [ ] All migrations applied in production
- [ ] `.env` files configured (never committed)
- [ ] GitHub Actions deploy workflow pushed (requires `workflow` OAuth scope)
- [ ] README Phases 1–24 reviewed
- [ ] Golden master audit passed: `./scripts/golden_master_audit.sh`
- [ ] Golden master deploy dry-run: `DRY_RUN=true ./deploy/deploy_golden_master.sh`

### Backend

- [ ] `npm test` passing (64+ tests)
- [ ] `npm audit` reviewed
- [ ] Swagger portal live at `/api/docs`
- [ ] Public API rate limits tuned
- [ ] Webhook delivery logs in `webhook_deliveries`

### Mobile

- [ ] `flutter pub get` / `flutter test`
- [ ] `.env` with `API_BASE_URL`, optional `FEDERATED_SYNC_KEY`
- [ ] Store build via CI (`mobile/` App Bundle / iOS)

### Infrastructure

- [ ] systemd backend service enabled
- [ ] vLLM GPU node (optional)
- [ ] IPFS pinning service (optional)
- [ ] Redpanda/Kafka for event streaming (optional)

### Documentation

- [ ] `README.md` — feature overview
- [ ] `DEPLOYMENT.md` — install steps
- [ ] `MAINTENANCE.md` — this file
- [ ] `deploy/vllm/README.md` — inference setup

### Contacts & ownership

| Area | Owner action |
|------|--------------|
| API breaking changes | Bump `version` in root response + OpenAPI spec |
| DB schema | New numbered migration only — never edit applied migrations |
| Flutter releases | Tag + CI build number via `github.run_number` |

---

*Last updated: Phase 24 — Affective biometrics, P2P mesh, metaverse connectors, golden master release.*
