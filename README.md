# Status — Social Media Simulation

A mobile app where users create a digital persona and interact with AI-driven fictional characters across fandoms.

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Mobile   | Flutter (Dart)                      |
| API      | Node.js + Express + node-cron       |
| Database | PostgreSQL                          |
| Cache    | Redis (scaling / rate limiting)     |
| Realtime | Socket.io                           |
| AI       | OpenAI / Anthropic / Gemini (multi-LLM router) |
| Auth     | JWT + bcrypt                        |
| Media    | Local uploads via multer            |

## Features

- **JWT authentication** — register, login, secure token storage
- **Real-time WebSockets** — live feed, DMs, reputation updates, live stream chat/TTS
- **AI memory** — summarized conversation history within token limits
- **Local push notifications** — DMs and energy recharge alerts
- **Live feed** from PostgreSQL with image posts
- **Autonomous AI posting** — characters publish on a cron schedule
- **Energy system** — daily reset, hourly regen, in-app Energy Store
- **AI DMs & replies** with async responses
- **Relationship/reputation** dynamics
- **Explore** — discover characters by fandom
- **Profile** — avatar upload, stats, activity history
- **3D character viewer** — interactive GLB models on Explore/Profile (Phase 11)
- **Vector RAG memory** — pgvector long-term character recall (Phase 11)
- **Live AI video** — Simli lip-sync, LiveKit broadcast, Rive 2D fallback (Phase 12)
- **Super Chat** — spend Energy to pin messages; AI acknowledges on stream (Phase 12)
- **On-device AI** — Gemini Nano / Foundation Models for offline chat & GenUI (Phase 13)
- **Agentic tools** — calendar events, web search, external links in character DMs (Phase 13)
- **Spatial scenes** — persistent visionOS-style AI avatars in your workspace (Phase 14)
- **Proxemic UI** — plastic layouts adapt to intimate/personal/social/public zones (Phase 14)
- **Hands-free nav** — gaze dwell + voice commands for feed, DMs, and spatial mode (Phase 14)
- **Ubuntu desktop app** — system tray, D-Bus notifications, multi-window (Phase 15)
- **Production observability** — health probes + Prometheus `/metrics` (Phase 15)
- **E2E integration tests** — login, feed, DM, energy deduction (Phase 16)
- **Load testing** — k6 REST + WebSocket stress scripts (Phase 16)
- **Zero-trust API hardening** — helmet, CORS, Zod validation, auth rate limits (Phase 16)
- **Disaster recovery** — automated pg_dump backups with 30-day retention (Phase 16)
- **PostHog feature flags** — dynamic 3D avatars + LLM routing without redeploy (Phase 17)
- **Sentry RUM** — crash reporting on Flutter + Node.js with user/request context (Phase 17)
- **AI token telemetry** — Prometheus + PostHog cost/latency per LLM request (Phase 17)
- **Circuit breakers** — LLM provider protection with cached fallback (Phase 18)
- **Event streaming** — Kafka/Redpanda backbone for energy & reputation events (Phase 18)
- **Offline action queue** — sqflite sync for posts/DMs during outages (Phase 18)

## Phase 12 — Live Streaming

| Component | Path |
|-----------|------|
| Live session API | `backend/src/services/liveStreamService.js` |
| TTS → socket stream | `backend/src/services/liveTtsStreamService.js` |
| Super Chat → LLM → TTS | `backend/src/services/liveAiBroadcastService.js` |
| Flutter live screen | `mobile/lib/features/live/live_video_screen.dart` |
| Simli WebSocket wrapper | `mobile/lib/services/simli_live_service.dart` |
| Rive 2D fallback | `mobile/lib/widgets/rive_avatar_widget.dart` |

Run migration `backend/db/migrations/010_live_streaming.sql`. Set `SIMLI_API_KEY` in `mobile/.env` for photoreal avatars; without it, the Rive/animated fallback is used automatically.

## Phase 13 — On-Device AI & Agentic Workflows

| Component | Path |
|-----------|------|
| On-device inference | `mobile/lib/services/local_ai_service.dart` |
| Offline ApiService fallback | `mobile/lib/services/api_service.dart` |
| Generative UI renderer | `mobile/lib/widgets/genui_block_renderer.dart` |
| Agent tool registry | `backend/src/services/ai/agentTools.js` |
| Multi-step agent loop | `backend/src/services/ai/agentWorkflowService.js` |

`flutter_local_ai` powers offline DMs and feed replies via Gemini Nano / Apple Foundation Models when connectivity is lost. Tap the ✨ icon in chat to generate polls, mood widgets, or mini-games as typed GenUI blocks. Backend agent mode (enabled by default for DMs) lets characters call `create_calendar_event`, `web_search`, and `generate_external_link` tools autonomously.

## Phase 14 — Spatial Computing & Ambient AI

| Component | Path |
|-----------|------|
| Proxemic plastic layouts | `mobile/lib/widgets/spatial/plastic_layout.dart` |
| Spatial scene (visionOS-style) | `mobile/lib/features/spatial/spatial_scene_screen.dart` |
| On-device context processing | `mobile/lib/services/spatial_context_service.dart` |
| Gaze + voice navigation | `mobile/lib/services/gaze_voice_navigation_service.dart` |
| Spatial privacy middleware | `backend/src/middleware/spatialPrivacy.js` |
| Processed context + geofencing | `backend/src/services/spatialContextService.js` |

Set `SPATIAL_MODE=true` in `mobile/.env` on macOS/visionOS builds. Raw LiDAR, mesh, and eye-tracking data are **blocked at the API** — only bucketed context (proxemic zone, room type, lighting) is transmitted.

## Phase 15 — Native Desktop & Production Backend

| Component | Path |
|-----------|------|
| Linux desktop bootstrap | `mobile/scripts/init-linux-desktop.sh` |
| D-Bus notifications | `mobile/lib/services/linux_notification_service.dart` |
| Tray + multi-window | `mobile/lib/services/desktop_shell_service.dart` |
| Prometheus metrics | `backend/src/observability/metrics.js` |
| Readiness probe | `GET /api/v1/health/ready` |
| systemd unit | `deploy/status-backend.service` |
| Deploy script | `scripts/deploy-backend.sh` |

### Ubuntu desktop build

```bash
sudo apt install clang cmake ninja-build pkg-config libgtk-3-dev libayatana-appindicator3-dev
cd mobile
bash scripts/init-linux-desktop.sh
flutter pub get
flutter run -d linux
```

AI character DMs trigger native freedesktop notifications via D-Bus. The system tray keeps Status running in the background; use **Open Messages Window** for a secondary desktop window.

### Backend production deploy

```bash
sudo ./scripts/deploy-backend.sh
journalctl -u status-backend -f
curl http://localhost:3000/api/v1/health/ready
curl http://localhost:3000/metrics
```

Point Prometheus at `/metrics` using `deploy/prometheus-scrape.example.yml` as a template.

## Phase 16 — E2E Testing, Load Testing & Disaster Recovery

| Component | Path |
|-----------|------|
| Flutter E2E suite | `mobile/integration_test/app_test.dart` |
| k6 REST load test | `loadtests/k6/rest-api-load.js` |
| k6 WebSocket load test | `loadtests/k6/websocket-load.js` |
| Security middleware | `backend/src/middleware/security.js`, `cors.js`, `validate.js` |
| Zod schemas | `backend/src/validation/schemas.js` |
| PostgreSQL backup | `scripts/backup.sh` |
| Daily backup cron | `deploy/status-backup.cron` |

### E2E tests (Flutter)

```bash
cd mobile
flutter test integration_test/app_test.dart \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

Covers registration, login, feed scroll, AI character DM, and energy UI deduction.

### Load tests (k6)

```bash
k6 run loadtests/k6/rest-api-load.js
k6 run -e VUS=200 loadtests/k6/websocket-load.js
```

### Backups

```bash
./scripts/backup.sh
sudo cp deploy/status-backup.cron /etc/cron.d/status-backup
```

## Phase 17 — Observability, Feature Flags & RUM

| Component | Path |
|-----------|------|
| PostHog backend | `backend/src/services/posthogService.js` |
| Flag-driven LLM routing | `backend/src/services/ai/flagRouting.js` |
| AI token metrics | `backend/src/services/aiTelemetryService.js` |
| Flag config reference | `backend/config/posthog-flags.example.json` |
| Sentry Express | `backend/src/config/sentry.js`, `middleware/errorHandler.js` |
| Flutter PostHog | `mobile/lib/services/feature_flag_service.dart` |
| Flutter Sentry RUM | `mobile/lib/services/telemetry_service.dart` |
| Gated 3D avatars | `mobile/lib/widgets/gated_character_3d_viewer.dart` |
| In-app feedback | `mobile/lib/features/feedback/feedback_screen.dart` |

Create PostHog flags (`enable-3d-avatars`, `force-gemini-dm`, etc.) per `backend/config/posthog-flags.example.json`. Set `POSTHOG_API_KEY` and `SENTRY_DSN` in both `.env` files.

```bash
# Backend AI metrics include token/cost series
curl http://localhost:3000/metrics | rg ai_

# Submit feedback (authenticated)
POST /api/v1/feedback
```

## Phase 18 — Enterprise Resilience, Chaos & Multi-Region HA

| Component | Path |
|-----------|------|
| Circuit breaker | `backend/src/services/circuitBreaker.js` |
| AI response cache | `backend/src/services/ai/responseCache.js` |
| Multi-region config | `backend/src/config/region.js` |
| Event streaming | `backend/src/services/eventStreamService.js` |
| Redpanda overlay | `deploy/redpanda-compose.yml` |
| Chaos Mesh (staging) | `deploy/chaos-mesh/staging/` |
| Flutter offline queue | `mobile/lib/services/offline_action_queue_service.dart` |

```bash
# Multi-region status
curl http://localhost:3000/api/v1/health/region

# Event backbone
docker compose -f docker-compose.yml -f deploy/redpanda-compose.yml up -d

# Chaos experiments (staging K8s)
kubectl apply -f deploy/chaos-mesh/staging/ -n status-staging
```

LLM calls trip per-provider circuit breakers and fall back to cached/mock responses. Flutter queues posts/DMs in `sqflite` on 503 or network failure and syncs when online.

See [DEPLOYMENT.md](DEPLOYMENT.md) for release checklist and required secrets.

## Quick Start

### Option A — Full stack (Docker)

```bash
docker compose up -d --build
```

Services:
- **API** — http://localhost:3000
- **PostgreSQL** — localhost:5432
- **Redis** — localhost:6379

### Option B — Local dev

#### 1. Start PostgreSQL + Redis

```bash
docker compose up -d db redis
```

Apply migrations on an existing database:

```bash
psql -d status -f backend/db/migrations/005_auth_media_store.sql
psql -d status -f backend/db/migrations/006_ai_memory.sql
psql -d status -f backend/db/migrations/008_community_platform.sql
psql -d status -f backend/db/migrations/009_vector_memory.sql
psql -d status -f backend/db/migrations/010_live_streaming.sql
psql -d status -f backend/db/migrations/011_spatial_computing.sql
psql -d status -f backend/db/migrations/012_user_feedback.sql
```

Fresh installs can use `backend/db/schema.sql` directly.

#### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Dev account (after migration): `player@status.dev` / `password123`

#### 3. Mobile

```bash
cd mobile
flutter create . --project-name status --org com.status   # first time only
flutter pub get
flutter run
```

On a physical device or Android emulator:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

Set `API_BASE_URL` in backend `.env` so uploaded image URLs resolve correctly on mobile.

## WebSocket Events

Connect to `/socket.io` with JWT in handshake auth:

| Event | Direction | Payload |
|-------|-----------|---------|
| `new_post` | server → client | Full post object (feed shape) |
| `new_message` | server → client | `{ threadId, characterId, message }` |
| `reputation_change` | server → client | `{ reputation, followerCount, affinityDelta, … }` |
| `energy_recharged` | server → client | `{ energy_remaining, energy_max, reset_at }` |

## Auth & API

### Public routes

```
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/store/products
GET  /api/v1/posts
GET  /api/v1/health
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /metrics                    (Prometheus scrape target)
```

### Protected routes (Bearer JWT)

```
GET   /api/v1/auth/me
PATCH /api/v1/profile
POST  /api/v1/uploads/image
POST  /api/v1/posts
POST  /api/v1/energy/refill
GET   /api/v1/profile/activity
POST  /api/v1/characters
GET   /api/v1/characters/mine
POST  /api/v1/messages
GET   /api/v1/messages/threads
POST  /api/v1/messages/groups
POST  /api/v1/messages/groups/send
GET   /api/v1/messages/groups
POST  /api/v1/voice/transcribe
POST  /api/v1/voice/synthesize
POST  /api/v1/analytics/events
GET   /api/v1/live/sessions
POST  /api/v1/live/sessions
GET   /api/v1/live/sessions/:sessionId
POST  /api/v1/live/sessions/:sessionId/chat
POST  /api/v1/live/sessions/:sessionId/super-chat
DELETE /api/v1/live/sessions/:sessionId
GET   /api/v1/spatial/scenes
POST  /api/v1/spatial/scenes
GET   /api/v1/spatial/scenes/:sceneKey
DELETE /api/v1/spatial/scenes/:sceneKey
POST  /api/v1/spatial/context
POST  /api/v1/spatial/react
GET   /api/v1/admin/characters   (admin only)
POST  /api/v1/admin/characters   (admin only)
```

Server-logged analytics: `energy_spent`, `dm_sent`, `ai_replied`.  
Client batches: `screen_view`, `tab_selected`, `store_opened`, `compose_opened`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CRON_ENABLED` | `true` | Master switch |
| `JWT_SECRET` | — | Required in production |
| `REDIS_URL` | — | Redis connection (optional locally) |
| `API_BASE_URL` | auto | Public URL for uploaded media |
| `FEED_CACHE_TTL` | `60` | Redis feed cache TTL (seconds) |
| `AI_RATE_LIMIT_MAX` | `30` | AI requests per user per window |
| `AI_RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `AI_RECENT_MESSAGES` | `6` | Verbatim messages kept in AI prompt |
| `AI_SUMMARIZE_THRESHOLD` | `10` | Messages before summarization kicks in |
| `AI_PROVIDER` | `mock` | `auto` enables multi-LLM router |
| `GEMINI_API_KEY` | — | Gemini 2.5 Flash for feed/social tasks |
| `ANTHROPIC_API_KEY` | — | Claude for deep DM conversations |
| `IMAGE_GEN_ENABLED` | `true` | Autonomous post image generation |
| `IMAGE_GEN_PROBABILITY` | `0.35` | Chance a post includes an image |
| `WHISPER_MODEL` | `whisper-1` | Voice transcription model |
| `TTS_MODEL` | `tts-1` | Server-side TTS (optional) |
| `LIVEKIT_URL` | — | LiveKit WebSocket URL for live broadcast |
| `LIVEKIT_API_KEY` | — | LiveKit API key for room tokens |
| `LIVEKIT_API_SECRET` | — | LiveKit API secret |
| `SIMLI_API_KEY` | — | Simli lip-sync (Flutter `.env`) |
| `SUPER_CHAT_ENERGY_COST` | `25` | Energy to pin a Super Chat |
| `SUPER_CHAT_PIN_MINUTES` | `5` | How long super chats stay prioritized |
| `TTS_STREAM_CHUNK_BYTES` | `4096` | PCM chunk size for live TTS streaming |
| `AI_POST_CRON` | `0 */4 * * *` | Autonomous post schedule |
| `ENERGY_COOLDOWN_CRON` | `0 * * * *` | Hourly partial regen |
| `ENERGY_COOLDOWN_AMOUNT` | `5` | Energy restored per cooldown tick |

## Project Layout

```
Status/
├── deploy/
│   ├── status-backend.service
│   ├── status-backup.cron
│   └── prometheus-scrape.example.yml
├── loadtests/k6/
│   ├── rest-api-load.js
│   └── websocket-load.js
├── scripts/
│   ├── deploy-backend.sh
│   └── backup.sh
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── scripts/run-migrations.sh
│   ├── src/observability/metrics.js
│   ├── db/migrations/
│   ├── src/services/socketService.js
│   ├── src/services/contextWindowManager.js
│   └── uploads/
└── mobile/
    ├── linux/
    ├── scripts/init-linux-desktop.sh
    └── lib/
        ├── services/realtime_service.dart
        ├── services/notification_service.dart
        ├── services/linux_notification_service.dart
        ├── services/desktop_shell_service.dart
        └── features/
```

## Phase 19 — Self-Hosted LLM, Fine-Tuning Pipeline & E2EE DMs

### vLLM inference (port 8000)

```bash
export HF_TOKEN=hf_...   # for gated Llama 3 weights
chmod +x deploy/vllm/setup-vllm.sh
./deploy/vllm/setup-vllm.sh
```

Set in `backend/.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VLLM_BASE_URL` | — | OpenAI-compatible endpoint (`http://127.0.0.1:8000/v1`) |
| `VLLM_MODEL` | `meta-llama/Meta-Llama-3-8B-Instruct` | Served model id |
| `SELF_HOSTED_AI_PREFERRED` | `false` | Route DMs/feed to vLLM first |

### Fine-tuning JSONL export

Background worker (`fine-tuning-export` cron, Sundays 03:00) extracts DM and post-reply pairs, scrubs PII, and writes Llama 3 chat JSONL to `backend/data/fine-tuning/`.

Manual export:

```bash
node backend/scripts/export-fine-tuning-data.js
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `FINE_TUNING_EXPORT_ENABLED` | `true` | Disable scheduled export |
| `FINE_TUNING_EXPORT_CRON` | `0 3 * * 0` | Weekly schedule |
| `FINE_TUNING_EXPORT_LIMIT` | `5000` | Max DM pairs per run |

Apply migration `013_e2ee_fine_tuning.sql` before using E2EE columns.

### E2EE direct messages

- Toggle **lock icon** in chat to send encrypted payloads (`POST /api/v1/messages` with `encrypted`, `ciphertext`, `encryptionMeta`).
- Server stores ciphertext only; moderation and AI replies are skipped for encrypted messages.
- Flutter client encrypts via `cryptography` (AES-GCM); `mobile/native/e2ee/` documents the future Olm/Megolm Rust bridge.
- Register device keys: `POST /api/v1/e2ee/keys`.

## Phase 20 — Wearables, Agent Wallets, IPFS & ZKP Privacy

### Smart glasses HUD

Set `WEARABLE_MODE=true` in `mobile/.env` to launch the lightweight HUD after login, or open it from Profile → **Open glasses HUD**.

- `WearableHudScreen` — ambient character stream + energy pill
- `WearableCompanionService` — low-power BLE background sync (`flutter_blue_plus`)
- Sync API: `GET /api/v1/wearable/sync`

### Autonomous agent wallets

Each AI character gets a wallet (`agent_wallets`) with an energy pool and token balance. Characters autonomously tip users for high-engagement posts and community objectives.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/characters/:id/wallet` | Wallet balance + recent tips |
| `GET /api/v1/wallets/agents` | All character wallets |

Cron `agent-tip-sweep` runs every 6 hours by default.

### Decentralized media (IPFS)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/storage/pin` | Pin uploaded file → CID |
| `POST /api/v1/storage/pin-url` | Pin remote URL |
| `POST /api/v1/storage/characters/:id/pin` | Pin avatar/GLB to character |
| `GET /api/v1/storage/resolve` | Resolve CID → gateway URL |

Set `IPFS_AUTO_PIN=true` to auto-pin uploads. CIDs stored on `users`, `ai_characters`, and `posts` (migration `014_wearable_wallets_ipfs_zkp.sql`).

### Zero-knowledge reputation proofs

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/zkp/proof` | Generate proof bundle (auth) |
| `POST /api/v1/zkp/verify` | Verify claim without PII (public) |

Supported claims: `reputation_min`, `account_age_days`, `vip`. Verifier sees only a pseudonymous commitment — never user id, email, or chat history.

## Phase 21 — Multi-Agent AI, Federated Learning & Developer API

### Multi-agent coordination

When `MULTI_AGENT_ENABLED=true` (default), agent modes (`dm`, `group_dm`, `post_reply`) use a **coordinator** that spawns parallel subagents:

| Subagent | Role |
|----------|------|
| Research | Lore/web context in isolated window |
| Tools | Calendar, links |
| Dialogue | Final in-character reply synthesis |

Implementation: `backend/src/services/ai/multiAgentCoordinator.js`

### Federated learning

On-device preference training (`FederatedLearningService`) syncs encrypted weight deltas — no raw chat leaves the device.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/public/federated/status` | Open round info |
| `GET /api/v1/public/federated/weights` | Latest global baseline |
| `POST /api/v1/public/federated/submit` | Submit encrypted contribution |

Set matching keys: backend `FEDERATED_AGGREGATION_KEY` ↔ mobile `FEDERATED_SYNC_KEY`

### Public developer API

**Developer portal:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

```bash
# 1. Register client (authenticated)
POST /api/v1/developers/clients  { "name": "My App" }

# 2. Get token
POST /api/v1/public/oauth/token
  { "grant_type": "client_credentials", "client_id": "...", "client_secret": "..." }

# 3. Call API
GET /api/v1/public/feed
Authorization: Bearer <token>
```

**Webhooks:** `POST /api/v1/public/webhooks` — subscribe to `narrative.event`, `character.status`, `feed.post`

See **`MAINTENANCE.md`** for deployment topology and hand-off checklist.

## Phase 22 — AI Governance, Post-Quantum Security & Global Edge

### AI governance & compliance

Automated logging for EU AI Act / GDPR:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/compliance/audit` | Export governance + consent audit trail (admin) |
| `GET /api/v1/compliance/status` | CDN, replicas, anomaly summary (admin) |

Every AI decision logs model provider, provenance hash, and explainability metadata via `aiGovernanceService`.

### Post-quantum cryptography

- **JWT:** Hybrid HS256 + detached PQ signature (`X-Status-PQ-Signature` header)
- **E2EE DMs:** CRYSTALS-Kyber768 Rust bridge (`mobile/native/e2ee/pq_crypto/`) + AES-256-GCM
- Register Kyber keys: `POST /api/v1/pq/keys`

Build native library: `mobile/native/e2ee/pq_crypto/build.sh`

### Global edge & read replicas

- **CDN:** Terraform in `deploy/cdn/` (CloudFront + Cloudflare)
- **Read routing:** Feed queries use geographic PostgreSQL replicas via `CF-IPCountry`

```env
CDN_BASE_URL=https://cdn.status.app
DATABASE_READ_URLS=eu-west-1=postgresql://...,ap-southeast-1=postgresql://...
```

### AI observability & alerting

- Anomaly detection: prompt injection, hallucination markers, latency spikes, PQ handshake failures
- Prometheus rules: `deploy/monitoring/ai-alerting-rules.yml`
- Alerts dispatch to Slack / PagerDuty when configured

## Phase 23 — Self-Healing, Synthetic Simulation, Spatial Audio & BCI

### Autonomous self-healing daemon

Production runtime errors and payload-shape shifts trigger an automated patch pipeline:

| Component | Path |
|-----------|------|
| Daemon config | `deploy/self-healing/daemon.config.json` |
| Orchestrator | `backend/src/services/selfHealing/selfHealingService.js` |
| Sandbox evaluator | `backend/src/services/selfHealing/selfHealingSandbox.js` |
| Hot-fix registry | `backend/src/services/selfHealing/selfHealingRegistry.js` |

Admin endpoints: `GET /api/v1/admin/self-healing/status`, `POST /api/v1/admin/self-healing/inspect`

```env
SELF_HEALING_ENABLED=true
SELF_HEALING_AUTO_APPLY=true
SELF_HEALING_CONFIG=deploy/self-healing/daemon.config.json
```

### Synthetic data simulation engine

Generates thousands of virtual personas to stress-test character drift and guardrails on staging:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/admin/synthetic/run` | Launch persona batch (admin) |
| `GET /api/v1/admin/synthetic/curated` | Export fine-tuning JSONL candidates |

```env
SYNTHETIC_SIM_ENABLED=true
SYNTHETIC_PERSONA_COUNT=100
SYNTHETIC_STAGING_ONLY=true
```

### 3D spatial audio (Flutter)

`SpatialAudioService` adjusts pan, attenuation, and reverb from avatar distance/orientation in spatial scenes. Integrated in `SpatialSceneScreen` for character TTS replies.

```env
# mobile/.env
SPATIAL_AUDIO=true
```

Dependency: `just_audio` for spatial file/URL playback.

### BCI input abstraction (Flutter + Backend)

`BciInputService` maps processed valence/arousal/focus metrics (no raw EEG) to UI theme colors and character affinity shifts.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/bci/intent` | Submit processed neural intent |
| `GET /api/v1/bci/events` | Recent BCI events for user |

```env
BCI_MODE=true
```

Privacy: raw neural waveforms blocked by `bciPrivacyMiddleware` — only bucketed metrics accepted.

## Phase 24 — Biometric Affect, P2P Mesh, Metaverse & Golden Master

### Affective biometric feedback

On-device processing of HRV, facial valence, and voice stress feeds the local AI context window and backend prompts:

| Component | Path |
|-----------|------|
| Biometrics service | `mobile/lib/services/affective_biometrics_service.dart` |
| AI context bridge | `mobile/lib/services/affective_context_bridge.dart` |
| Backend service | `backend/src/services/affectiveBiometricsService.js` |

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/affective/metrics` | Submit processed affective metrics |
| `GET /api/v1/affective/context` | Latest affective AI prompt block |

```env
AFFECTIVE_BIOMETRICS=true
```

### P2P edge mesh networking

WebRTC + libp2p-style gossip for offline thread/embedding/memory sync:

| Component | Path |
|-----------|------|
| Mesh service | `mobile/lib/services/mesh_network_service.dart` |
| Gossip protocol | `mobile/lib/services/mesh_gossip_protocol.dart` |
| Signaling relay | `backend/src/services/meshRelayService.js` |

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/mesh/register` | Register mesh peer |
| `POST /api/v1/mesh/gossip` | Gossip sync record |
| `POST /api/v1/mesh/signal` | WebRTC signaling relay |

```env
MESH_NETWORK_ENABLED=true
MESH_CLUSTER_ID=status-local
```

### Open metaverse connectors (VRM / OpenXR)

Export character personalities, memories, and voice streams to external engines:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/metaverse/sync` | Create sync session (VRM/OpenXR manifest) |
| `GET /api/v1/metaverse/sync/:token` | Retrieve sync manifest |
| `GET /api/v1/metaverse/export/:characterId` | Direct character export |

WebSocket: `join_metaverse_sync`, `metaverse_voice_stream`, `metaverse_personality_sync`

Supported engines: Unreal Engine 5, Unity, OpenXR runtimes.

### Golden master release

| Artifact | Path |
|----------|------|
| Deployment script | `deploy/deploy_golden_master.sh` |
| Security audit | `scripts/golden_master_audit.sh` |
| Architecture diagrams | `docs/GOLDEN_MASTER.md` |

```bash
chmod +x deploy/deploy_golden_master.sh scripts/golden_master_audit.sh
./scripts/golden_master_audit.sh
./deploy/deploy_golden_master.sh
```

Migration **018** adds `affective_biometric_events`, `mesh_peer_sessions`, `mesh_gossip_records`, `metaverse_sync_sessions`.

