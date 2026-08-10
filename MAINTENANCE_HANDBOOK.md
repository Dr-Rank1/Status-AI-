# Status — Maintenance Handbook

Operational guide for the Status platform after Phase 26 archival. Covers architecture, disaster recovery, monetization, edge AI, and character fine-tuning.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Map](#2-component-map)
3. [RevenueCat & Subscriptions](#3-revenuecat--subscriptions)
4. [Edge AI & NPU Inference](#4-edge-ai--npu-inference)
5. [Dependency Automation (Renovate)](#5-dependency-automation-renovate)
6. [Disaster Recovery](#6-disaster-recovery)
7. [Fine-Tuning New AI Characters](#7-fine-tuning-new-ai-characters)
8. [Production Checklist](#8-production-checklist)
9. [Branch Protection & Archival](#9-branch-protection--archival)

---

## 1. System Architecture

```
┌─────────────────┐     HTTPS/WSS      ┌──────────────────┐
│  Flutter Client │ ◄────────────────► │  Node.js API     │
│  (iOS/Android/  │                    │  Express + JWT   │
│   Desktop)      │                    │  Socket.IO       │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         │ RevenueCat SDK                       │ RevenueCat Webhooks
         ▼                                      ▼
┌─────────────────┐                    ┌──────────────────┐
│  App Store /    │                    │  PostgreSQL      │
│  Play Store     │                    │  + pgvector RLS  │
└─────────────────┘                    └────────┬─────────┘
         │                                      │
         │ ONNX INT8 / OS NPU                   │ Redis / Kafka (optional)
         ▼                                      ▼
┌─────────────────┐                    ┌──────────────────┐
│  On-device AI   │                    │  LLM Router      │
│  EdgeInference  │                    │  Anthropic/Gemini│
└─────────────────┘                    └──────────────────┘
```

**Multi-tenant isolation:** Every API request carries `X-Tenant-Slug`. PostgreSQL RLS sets `app.tenant_id` per connection (`backend/src/config/database.js`).

**Auth:** JWT (optional post-quantum hybrid). Session payload includes user, energy, and subscription entitlements.

---

## 2. Component Map

| Layer | Path | Purpose |
|-------|------|---------|
| API entry | `backend/src/index.js` | Express, webhooks, middleware |
| Routes | `backend/src/routes/index.js` | REST + RevenueCat webhook |
| Subscriptions | `backend/src/services/subscriptionService.js` | Pro tier, energy cap |
| RevenueCat | `backend/src/services/revenueCatService.js` | Webhook verification & events |
| Flutter client | `mobile/lib/` | UI, offline queue, edge AI |
| RevenueCat client | `mobile/lib/services/subscription_service.dart` | Cross-platform IAP |
| Edge inference | `mobile/lib/services/edge_inference_service.dart` | INT8 ONNX + NPU |
| Admin dashboard | `dashboard/` | Next.js tenant admin |
| CI/CD | `.github/workflows/deploy.yml` | Build & test |
| Renovate | `renovate.json` | Automated dependency PRs |
| Migrations | `backend/db/migrations/` | Schema evolution |

---

## 3. RevenueCat & Subscriptions

### Pro tier entitlements

- **Unlimited energy** (`energy_max = 9999`)
- **3D avatar access** (client + PostHog flag bypass)
- Cross-device sync via RevenueCat `app_user_id` (= backend user UUID)

### Backend webhook

```
POST /api/v1/webhooks/revenuecat
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
```

Handler: `backend/src/controllers/subscriptionController.js`

Supported events: `INITIAL_PURCHASE`, `RENEWAL`, `EXPIRATION`, `CANCELLATION`, etc.

### Client sync

```
POST /api/v1/subscription/sync   (JWT required)
GET  /api/v1/subscription/entitlements
```

### Environment

```env
# backend/.env
REVENUECAT_WEBHOOK_SECRET=your-webhook-secret
REVENUECAT_PRO_PRODUCT_IDS=status_pro_monthly,status_pro_yearly,pro

# mobile/.env
REVENUECAT_IOS_API_KEY=appl_...
REVENUECAT_ANDROID_API_KEY=goog_...
```

### RevenueCat dashboard setup

1. Create entitlement `pro` (or `status_pro`)
2. Attach products `status_pro_monthly`, `status_pro_yearly`
3. Set webhook URL to `https://api.<domain>/api/v1/webhooks/revenuecat`
4. Use backend user UUID as RevenueCat `app_user_id`

---

## 4. Edge AI & NPU Inference

### Inference priority chain

1. **ONNX INT8 + NPU** — CoreML (Apple Neural Engine) / NNAPI + Hexagon (Snapdragon)
2. **OS native NPU** — `flutter_local_ai` (Gemini Nano, Apple Foundation Models)
3. **Cloud API** — Backend LLM router

### Configuration

```env
EDGE_INFERENCE_ENABLED=true
ONNX_MODEL_PATH=assets/models/status_dm_int8.onnx
```

### Quantization pipeline

See `mobile/native/edge_inference/README.md`:

```bash
python -m onnxruntime.quantization.quantize_static ...
cp status_dm_int8.onnx mobile/assets/models/
cd mobile/native/edge_inference && ./build.sh
```

Platform channel: `com.status/edge_inference` (`edge_inference_platform.dart`).

---

## 5. Dependency Automation (Renovate)

**Config:** `renovate.json` at repo root.

| Manager | Scope |
|---------|-------|
| npm | `backend/`, `dashboard/` |
| pub | `mobile/` |
| github-actions | `.github/workflows/` |

**Auto-merge:** `.github/workflows/renovate-auto-merge.yml` runs backend + Flutter tests on Renovate PRs and auto-merges patch updates.

Enable Renovate GitHub App on the repository to activate.

---

## 6. Disaster Recovery

### RPO / RTO targets

| Asset | RPO | RTO | Method |
|-------|-----|-----|--------|
| PostgreSQL | 1 h | 4 h | `scripts/backup.sh` + WAL |
| User uploads | 24 h | 8 h | S3/CDN replica |
| Secrets | 0 | 1 h | Vault / GitHub Secrets |

### Backup procedure

```bash
./scripts/backup.sh                    # pg_dump + uploads tarball
# Store off-site: s3://status-backups/$(date +%F)/
```

### Restore procedure

```bash
# 1. Restore PostgreSQL
pg_restore -d status backup.dump

# 2. Run pending migrations
cd backend && npm run migrate

# 3. Verify health
curl localhost:3000/api/v1/health/ready

# 4. Redeploy clients (no action if API-compatible)
```

### Region failover (Phase 22)

Set `DATABASE_READ_URLS` and `REGION_PEER_URLS`. Route53 health checks flip traffic to standby region.

### Incident runbook

1. Check `/metrics` and Sentry for error spike
2. Verify PostgreSQL + Redis connectivity
3. If LLM provider down → circuit breaker falls back (`backend/src/services/circuitBreaker.js`)
4. If RevenueCat webhook lag → clients can `POST /subscription/sync`
5. Communicate via status page; rollback deploy via previous Docker tag

---

## 7. Fine-Tuning New AI Characters

### Overview

Characters are defined in `ai_characters` (tenant-scoped). Personality flows through:

- **System prompt** — `backend/src/services/ai/prompts.js`
- **Vector memory** — pgvector RAG (`EMBEDDING_MODEL`)
- **Relationship state** — `relationshipService.js`
- **Fine-tuning export** — Phase 19 pipeline

### Adding a character (production)

1. **Admin dashboard** → `/characters` — set name, bio, tone, fandom
2. **Or API:** `POST /api/v1/characters` with JWT
3. Seed vector memory with 5–10 exemplar DMs via staging conversations

### Fine-tuning workflow

```bash
# Export conversation pairs (PII-scrubbed)
cd backend
node scripts/export-fine-tuning-data.js

# External fine-tune (OpenAI / vLLM / Llama)
# Output: LoRA adapter or full weights

# For edge deployment — quantize to INT8 ONNX
python -m onnxruntime.quantization.quantize_static ...

# Deploy
cp status_dm_int8.onnx mobile/assets/models/
# Update character-specific adapter mapping in edge_inference config
```

### Quality gates

- Run synthetic simulation batch: `POST /api/v1/synthetic/batch` (staging only)
- Review AI governance audit log: `ai_governance_events`
- A/B test via PostHog feature flags before full rollout

### Prompt tuning checklist

- [ ] Bio ≤ 500 chars, distinct voice
- [ ] `AI_RECENT_MESSAGES` context window tested
- [ ] Moderation pass (`MODERATION_MODEL`)
- [ ] Energy costs configured for DMs/posts
- [ ] 3D avatar model URL (Pro tier) validated

---

## 8. Production Checklist

- [ ] `REVENUECAT_WEBHOOK_SECRET` set; mock IAP disabled
- [ ] `JWT_SECRET` rotated; `PQ_AUTH_ENABLED` evaluated
- [ ] PostgreSQL backups scheduled (cron)
- [ ] Renovate GitHub App installed
- [ ] Sentry + PostHog DSNs configured
- [ ] Branch protection on `main` (`scripts/lock_main_branch.sh`)
- [ ] Dead-code audit run (`scripts/dead_code_audit.sh`)
- [ ] E2E suite green: `flutter test integration_test/app_test.dart`

---

## 9. Branch Protection & Archival

Phase 26 marks the **golden master** production baseline.

```bash
chmod +x scripts/dead_code_audit.sh scripts/lock_main_branch.sh
./scripts/dead_code_audit.sh
./scripts/lock_main_branch.sh owner/status   # requires gh auth
```

**Archived phase docs:** `docs/GOLDEN_MASTER.md`, `CLIENT_HANDOFF.md`, `README.md` (Phases 1–26).

Future changes: feature branches → PR → CI → review → merge to `main`.

---

*Last updated: Phase 26 — Advanced Monetization, Edge Quantization, Zero-Touch Maintenance*
