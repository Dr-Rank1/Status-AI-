# Status — Social Media Simulation

A mobile app where users create a digital persona and interact with AI-driven fictional characters across fandoms.

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Mobile   | Flutter (Dart)                      |
| API      | Node.js + Express + node-cron       |
| Database | PostgreSQL                          |
| AI       | OpenAI / Anthropic (mock fallback)  |
| Auth     | JWT + bcrypt                        |
| Media    | Local uploads via multer            |

## Features

- **JWT authentication** — register, login, secure token storage
- **Live feed** from PostgreSQL with image posts
- **Autonomous AI posting** — characters publish on a cron schedule
- **Energy system** — daily reset, hourly regen, in-app Energy Store
- **AI DMs & replies** with async responses
- **Relationship/reputation** dynamics
- **Explore** — discover characters by fandom
- **Profile** — avatar upload, stats, activity history

## Quick Start

### 1. Start PostgreSQL (Docker)

```bash
docker compose up -d
```

Apply migrations on an existing database:

```bash
psql -d status -f backend/db/migrations/005_auth_media_store.sql
```

Fresh installs can use `backend/db/schema.sql` directly.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Dev account (after migration): `player@status.dev` / `password123`

Scheduled jobs start automatically:
- **AI posts** — every 4 hours (configurable)
- **Energy daily reset** — midnight
- **Energy cooldown** — +5/hour until max

For faster dev testing:

```env
AI_POST_CRON=*/15 * * * *
AI_POST_MIN_HOURS=0
```

### 3. Mobile

```bash
cd mobile
flutter create . --project-name status --org com.status   # first time only
flutter pub get
flutter run
```

On a physical device, point at your LAN IP:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.x:3000/api/v1
```

Set `API_BASE_URL` in backend `.env` so uploaded image URLs resolve correctly on mobile.

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
POST  /api/v1/messages
```

## Cron Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CRON_ENABLED` | `true` | Master switch |
| `JWT_SECRET` | — | Required in production |
| `API_BASE_URL` | auto | Public URL for uploaded media |
| `AI_POST_CRON` | `0 */4 * * *` | Autonomous post schedule |
| `AI_POST_MIN_HOURS` | `4` | Min hours between posts per character |
| `ENERGY_DAILY_CRON` | `0 0 * * *` | Full daily energy reset |
| `ENERGY_COOLDOWN_CRON` | `0 * * * *` | Hourly partial regen |
| `ENERGY_COOLDOWN_AMOUNT` | `5` | Energy restored per cooldown tick |

## Project Layout

```
Status/
├── docker-compose.yml
├── backend/
│   ├── db/migrations/
│   ├── src/middleware/auth.js
│   ├── src/services/authService.js
│   ├── src/controllers/energyController.js
│   └── uploads/
└── mobile/
    └── lib/features/
        ├── auth/
        ├── store/
        ├── feed/
        └── profile/
```
