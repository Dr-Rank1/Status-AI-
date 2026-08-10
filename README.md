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
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── db/migrations/
│   ├── src/services/socketService.js
│   ├── src/services/contextWindowManager.js
│   └── uploads/
└── mobile/
    └── lib/
        ├── services/realtime_service.dart
        ├── services/notification_service.dart
        └── features/
```
