# V2 Platform Architecture Blueprint

**Status:** Scaffold (Phase 30) · **Compat:** `/api/v1` remains the production contract  
**Goal:** Evolve multi-modal LLMs and spatial computing without breaking V1 clients.

---

## 1. Versioning strategy

| Surface | Path | Clients |
|---------|------|---------|
| Production (stable) | `/api/v1/*` | Flutter Golden Master, public OAuth, webhooks |
| Next-gen (preview) | `/api/v2/*` | Experimental apps, dashboard ops panels |
| Docs | `/api/docs` | OpenAPI (v1 primary) |

**Rules**

1. Never remove or rename v1 routes without a deprecation window ≥ 2 minor releases.
2. v2 responses include `X-API-Version: 2` and `X-API-Compat: v1-clients-supported`.
3. New breaking shapes land only on v2; additive fields may back-port to v1.
4. Socket.IO events stay shared; new event names are prefixed `v2_` until GA.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ V1 Clients  │────►│ /api/v1      │────►│ Core services   │
└─────────────┘     └──────────────┘     │ (shared)        │
┌─────────────┐     ┌──────────────┐     │ AI router+cost  │
│ V2 Clients  │────►│ /api/v2      │────►│ SLA telemetry   │
└─────────────┘     │ (scaffold)   │     └─────────────────┘
                    └──────────────┘
```

---

## 2. Current v2 routes (`backend/src/routes/v2/index.js`)

| Method | Path | Status | Purpose |
|--------|------|--------|---------|
| GET | `/api/v2/version` | live | Capability discovery |
| GET | `/api/v2/health` | live | Compat health |
| GET | `/api/v2/ops/sla` | live | Rolling SLA snapshot (JWT) |
| GET | `/api/v2/ops/cost` | live | AI budget snapshot (JWT) |
| POST | `/api/v2/ai/multimodal` | 501 scaffold | Multi-modal generation |
| POST | `/api/v2/spatial/session` | 501 scaffold | Next-gen spatial session |

---

## 3. Planned multi-modal contract

```json
POST /api/v2/ai/multimodal
{
  "characterId": "uuid",
  "modalities": ["text", "image"],
  "prompt": "Describe the scene and reply in character",
  "attachments": [{ "type": "image", "url": "https://..." }],
  "spatialContextId": "optional-v1-scene-key"
}
```

Implementation will reuse `aiCostOptimizer` + circuit breakers; edge INT8 remains offline fallback.

---

## 4. Spatial computing V2

V1 `/api/v1/spatial/*` continues for processed context only.  
V2 sessions will add:

- Persistent OpenXR/VRM sync tokens with TTL
- Multi-user presence channels (`v2_spatial_presence`)
- Explicit privacy budgets (no raw mesh) — same Phase 14 constraints

---

## 5. Ops coupling

- SLA middleware feeds Prometheus + Slack/PagerDuty (`slaTelemetry.js`)
- Cost optimizer load-balances vLLM ↔ cloud (`aiCostOptimizer.js`)
- Weekly feedback curation → `data/fine-tuning/feedback-curated-*.jsonl`

---

## 6. Rollout checklist

- [x] Feature-flag `enable-api-v2-beta` / Flutter Profile toggle
- [x] Dual-write metrics for v2 traffic share (SLA middleware covers `/api/v2`)
- [x] Contract tests in `backend/test/phase30.test.js` + `phase31.test.js`
- [ ] Update `API_REFERENCE.md` when spatial/multimodal leave preview
- [ ] Dual-approval PR before flipping any capability to full GA

## 7. Phase 31 beta surfaces

| Capability | Status | Notes |
|------------|--------|-------|
| AGI reflection | live | Auto-wraps v1 AI replies when `AGI_REFLECTION_ENABLED` |
| Knowledge mesh | live | Postgres always; Neo4j when `NEO4J_URI` + `neo4j-driver` |
| GraphQL HTTP | beta | `POST /api/v2/graphql` |
| GraphQL subscriptions | beta | Socket.IO `v2_graphql_subscribe` |
| Wasm tool sandbox | live | Worker + Wasm ping; `run_sandboxed_script` tool |

## 8. Phase 32 — GA controls

| Control | Env / API |
|---------|-----------|
| Enable GA switching | `V2_GA_ENABLED=true` |
| Traffic % | `POST /api/v2/ops/traffic` `{ "v2Percent": 5 }` |
| Shadow % | `V2_SHADOW_PERCENT` / traffic API |
| Auto-rollback | error rate > `V2_SHADOW_ERROR_ROLLBACK` (default 0.01%) |
| Residency | `X-Status-Data-Residency` / `SOVEREIGN_CLOUD_ENFORCE` |
| QKD | `QKD_ENABLED=true` + `/api/v2/ops/qkd/channel` |

## 9. Phase 34 — Stateless MCP substrate

| Surface | Notes |
|---------|-------|
| `POST /api/v2/mcp` | Header-routed (`Mcp-Method`, `Mcp-Name`); protocol `2026-07-28` |
| Tool list cache | `ttlMs` + `cacheScope` → `Cache-Control` / Redis |
| MRTR | `POST /api/v2/mcp/mrtr/pause|resume` — durable `requestState` |
| Swarm | `MCP_SWARM_BACKEND=cloudflare\|cloudrun\|local` + `deploy/serverless/agent-swarm/` |

No sticky sessions: MRTR state lives in Redis/Postgres (`023_phase34_mcp_mrtr.sql`).

---

*Phase 30–34: V2 progresses scaffold → beta → GA → context/MCP → stateless serverless swarms.*
