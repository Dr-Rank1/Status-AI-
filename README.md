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
- **Real-time WebSockets** — live feed, DMs, reputation updates
- **AI memory** — summarized conversation history within token limits
- **Local push notifications** — DMs and energy recharge alerts
- **Live feed** from PostgreSQL with image posts
- **Autonomous AI posting** — characters publish on a cron schedule
- **Energy system** — daily reset, hourly regen, in-app Energy Store
- **AI DMs & replies** with async responses
- **Relationship/reputation** dynamics
- **Explore** — discover characters by fandom
- **Profile** — avatar upload, stats, activity history
- **Docker deployment** — API + PostgreSQL + Redis
- **Redis feed cache** — cached social feed with invalidation on new posts
- **AI rate limiting** — Redis-backed limits on DM/reply endpoints
- **Admin tools** — manage AI characters via API + hidden admin screen
- **Analytics** — server and client event logging
- **App Store polish** — splash screen, launcher icons, OS permissions
- **CI/CD** — GitHub Actions + Codemagic, Fastlane, Play/App Store builds
- **Voice AI DMs** — mic capture, Whisper transcription, character TTS replies
- **Multi-LLM routing** — Claude for deep DMs, Gemini 2.5 Flash for feed posts
- **Autonomous image posts** — AI characters attach generated visuals to feed posts
- **Offline mode** — Hive cache for feed, inbox, and thread messages
- **User character creator** — publish AI personas to Explore and earn Energy from interactions
- **Group chats** — multi-user rooms with @mention AI triggers via WebSocket
- **Global narrative events** — scheduled plot twists injected into all AI context windows
- **AI safety pipeline** — OpenAI omni-moderation pre-filters text and images before LLM calls

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
psql -d status -f backend/db/migrations/007_admin_analytics.sql
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
