# Status Operations Runbook

**Version:** Golden Master v1.0.0 · Phase 28  
**Audience:** On-call engineers, SRE, tenant admins  
**Related:** [MAINTENANCE_HANDBOOK.md](./MAINTENANCE_HANDBOOK.md) · [API_REFERENCE.md](./API_REFERENCE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Outline

1. [On-call posture](#1-on-call-posture)
2. [Incident response protocols](#2-incident-response-protocols)
3. [Disaster recovery](#3-disaster-recovery)
4. [AI persona reset procedures](#4-ai-persona-reset-procedures)
5. [Subscription & billing incidents](#5-subscription--billing-incidents)
6. [Edge AI / offline fallback](#6-edge-ai--offline-fallback)
7. [Multi-tenant isolation incidents](#7-multi-tenant-isolation-incidents)
8. [Key rotation](#8-key-rotation)
9. [Escalation matrix](#9-escalation-matrix)

---

## 1. On-call posture

| Signal | Source | Action |
|--------|--------|--------|
| API 5xx spike | `/metrics`, Sentry | Check DB, circuit breaker, LLM providers |
| Energy spend failures | PostHog + Sentry | Verify Pro entitlements / RevenueCat webhook lag |
| LLM latency > 15s | AI anomaly alerts | Open circuit → mock/vLLM fallback |
| Region unhealthy | `/api/v1/health/region` | Fail over DNS / read replica |

**Health checks**

```bash
curl -sf https://api.<domain>/api/v1/health/live
curl -sf https://api.<domain>/api/v1/health/ready
curl -sf https://api.<domain>/metrics | head
```

---

## 2. Incident response protocols

### SEV-1 — API down / data loss risk

1. Acknowledge in incident channel; page platform lead.
2. Freeze deploys; do **not** force-push `main` (branch protection).
3. Capture: last deploy SHA, Sentry issue IDs, `pg_isready`, Redis ping.
4. Mitigate: roll back container/tag to previous Golden Master artifact.
5. If DB unreachable: promote read replica (Phase 22 geo routing) or restore from backup (`scripts/backup.sh`).
6. Postmortem within 48h.

### SEV-2 — AI quality / moderation failure

1. Disable agent tools: `AGENT_TOOLS_ENABLED=false`.
2. Force mock or self-hosted: `AI_PROVIDER=mock` or `SELF_HOSTED_AI_PREFERRED=true`.
3. Review `ai_governance_events` / compliance export: `GET /api/v1/compliance/audit`.
4. Re-enable after synthetic batch passes on staging.

### SEV-3 — Client crash / store regression

1. Confirm Sentry release tag (`status-mobile@1.0.0`).
2. Feature-flag kill switch via PostHog (`disable-ai-providers`, `enable-3d-avatars`).
3. Ship hotfix branch → dual-approval PR → CI green → merge.

### Communication template

> **Status incident** — `<SEV>` — `<title>`  
> Impact: `<users/tenants>` · Started: `<UTC>` · Commander: `<name>`  
> Next update: `<+30m>`

---

## 3. Disaster recovery

### Targets

| Asset | RPO | RTO | Tooling |
|-------|-----|-----|---------|
| PostgreSQL | ≤ 1h | ≤ 4h | `scripts/backup.sh`, WAL / snapshots |
| Uploads / CDN | ≤ 24h | ≤ 8h | Object storage + CDN purge |
| Secrets | 0 | ≤ 1h | Vault / GitHub Secrets + `rotate_keys.sh` |

### Restore steps

```bash
# 1. Restore DB
pg_restore -d status /backups/latest.dump

# 2. Migrations
cd backend && npm run migrate   # or: node scripts/run-migrations.sh

# 3. Verify
curl -sf localhost:3000/api/v1/health/ready

# 4. Redeploy API at tag v1.0.0; clients use App Store / Play / desktop channels
```

### Region failover

1. Mark primary unhealthy in DNS health checks.
2. Point `DATABASE_URL` / `DATABASE_READ_URLS` at standby.
3. Confirm `REGION_PEER_URLS` peers respond.
4. Invalidate CDN cache for `/media` and avatar paths.

---

## 4. AI persona reset procedures

Use when a character drifts, leaks PII style, or fails moderation.

### Soft reset (prompt / memory)

1. Dashboard → **Characters** → edit bio / system tone, **or**  
   `PATCH /api/v1/tenant/admin/characters/:characterId/prompt` (admin JWT).
2. Clear recent vector memories for character (staging first):

```sql
-- Example — adjust table names to your deployment
DELETE FROM character_memories WHERE character_id = '<uuid>' AND created_at > NOW() - INTERVAL '7 days';
```

3. Run synthetic batch: `POST /api/v1/admin/synthetic/run` (staging only).
4. Spot-check 10 DMs; re-export fine-tuning if needed (`backend/scripts/export-fine-tuning-data.js`).

### Hard reset (relationship + wallet)

1. Reset relationship affinity scores for affected users (support ticket only).
2. Pause agent tips: disable `AGENT_TIP_SWEEP_CRON` / set wallet pool to 0 temporarily.
3. Re-seed exemplar DMs; redeploy edge INT8 adapter if on-device personality ships with character.

### Emergency kill

```bash
# Feature flag or env
AI_PROVIDER=mock
MULTI_AGENT_ENABLED=false
```

---

## 5. Subscription & billing incidents

| Symptom | Check | Fix |
|---------|-------|-----|
| Paid user still free tier | RevenueCat webhook logs + `subscription_events` | Replay webhook; `POST /subscription/sync` from client |
| Energy still depleting for Pro | `users.subscription_tier`, `energy_state.energy_max` | Re-run `applyProTier` via webhook `RENEWAL` |
| Double charge | Store + RC dashboard | Refund in App Store / Play; leave entitlement until period end |

Webhook: `POST /api/v1/webhooks/revenuecat` with `Authorization: Bearer $REVENUECAT_WEBHOOK_SECRET`.

---

## 6. Edge AI / offline fallback

Priority chain: ONNX INT8 NPU → OS NPU (`flutter_local_ai`) → cloud router.

If edge models misbehave:

```env
EDGE_INFERENCE_ENABLED=false
```

Rebuild native bridge: `mobile/native/edge_inference/build.sh`.  
Diagnostics: `edgeInferenceService.diagnostics` in Flutter debug builds.

---

## 7. Multi-tenant isolation incidents

1. Confirm `X-Tenant-Slug` on failing requests.
2. Verify RLS: `SET LOCAL app.tenant_id` in `database.js`.
3. Never run cross-tenant SQL without explicit admin break-glass.
4. Provision new tenant: `./scripts/provision_tenant.sh <slug> "<Name>"`.

---

## 8. Key rotation

```bash
./scripts/rotate_keys.sh --env-file backend/.env          # dry-run
# Paste new LLM keys into .env.rotated.*
./scripts/rotate_keys.sh --env-file backend/.env --apply
# Restart API; update PostgreSQL role password to match DATABASE_URL
```

After JWT rotation, all sessions invalidate — notify clients to re-login.

Audit trail: `docs/KEY_ROTATION_AUDIT.md`.

---

## 9. Escalation matrix

| Role | Owns |
|------|------|
| On-call eng | SEV-2/3 mitigate, runbooks |
| Platform lead | SEV-1, DB restore, branch unlock (if ever needed) |
| Security | Key leak, PQ/E2EE incidents |
| Tenant admin | Theme, moderation, character prompts via dashboard |

---

## 10. Phase 30 — Continuous SLA & diagnostics

### SLA alerts

HTTP middleware (`slaMiddleware`) feeds rolling windows. Breaches call `dispatchAlert` → Slack / PagerDuty (`SLACK_ALERT_WEBHOOK_URL`, `PAGERDUTY_ROUTING_KEY`).

Prometheus: `sla_uptime_ratio`, `sla_latency_p95_ms`, `sla_http_error_rate`, `sla_ai_hallucination_rate`, `sla_breaches_total`.

### Health CLI

```bash
cd backend && npm run health:check
```

Verifies PostgreSQL pool, Redis, pgvector HNSW, AI provider config, and current SLA window.

### Cost / fine-tune

- `AI_COST_MODE=thrifty|balanced|quality` + `AI_DAILY_BUDGET_USD`
- Weekly feedback curation cron: `FINE_TUNING_CURATION_CRON` (default Monday 04:00 UTC)

### V2

Preview routes under `/api/v2` — do not migrate production clients until capability status is `live` (`docs/V2_ARCHITECTURE.md`).

---

*Phase 28 closes the operational lifecycle. Prefer PRs with dual approval over emergency pushes. Phase 30 adds continuous telemetry without breaking V1.*
