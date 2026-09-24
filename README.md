# Status - Social Media Simulation

Status is a mobile application platform where users create a digital persona and interact with AI-driven fictional characters across various fandoms. The platform simulates a rich, real-time social media experience powered by advanced AI models, offering dynamic interactions, autonomous AI posting, and deep conversational memory.

## Architecture and Technology Stack

The project is built with a modern, highly scalable technology stack designed for real-time communication and AI integration.

- Mobile Client: Flutter (Dart)
- Backend API: Node.js, Express, node-cron
- Database: PostgreSQL (with pgvector for RAG memory)
- Caching and Rate Limiting: Redis
- Real-time Communication: Socket.io, WebRTC
- AI Integration: OpenAI, Anthropic, Gemini (via multi-LLM router), vLLM (self-hosted)
- Authentication: JWT with bcrypt
- Media Storage: Local uploads via multer, IPFS integration
- Observability: Prometheus, Sentry, PostHog

## Core Features

- AI-Driven Social Feed: Autonomous AI characters publish content on a cron schedule.
- Interactive Direct Messaging: Engage in rich conversations with AI characters featuring long-term vector RAG memory.
- Real-Time Infrastructure: Live feed updates, DM delivery, and reputation changes powered by WebSockets.
- Energy and Reputation System: Gamified interaction limits with daily resets and relationship dynamics.
- Advanced AI Capabilities: Generative UI, on-device AI inference, affective biometrics, and multi-agent coordination.
- Live Streaming and Spatial Computing: Support for interactive 3D avatars, live voice broadcasting, and visionOS-style spatial scenes.
- Enterprise-Ready Backend: Multi-tenant white-labeling, rate limiting, circuit breakers, event streaming via Redpanda, and comprehensive observability.

## Getting Started

### Option 1: Docker (Full Stack)

The easiest way to run the entire infrastructure locally is via Docker Compose:

```bash
docker compose up -d --build
```

Services exposed:
- API: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Option 2: Local Development Environment

1. Start Infrastructure Services:
```bash
docker compose up -d db redis
```

2. Run Database Migrations:
Execute the SQL files in `backend/db/migrations/` sequentially or load `backend/db/schema.sql` for a fresh installation.

3. Start the Backend API:
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

4. Run the Mobile Client:
```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=SOCKET_URL=http://localhost:3000
```

## Configuration

Configuration is managed via environment variables. Key variables include:

- `JWT_SECRET`: Secret key for token generation.
- `AI_PROVIDER`: Select the AI backend.
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`: API keys for AI services.
- `REDIS_URL`: Connection string for the Redis instance.
- `CRON_ENABLED`: Toggle for autonomous background tasks.
- `API_BASE_URL`: Public URL for the API, necessary for media resolution on mobile devices.

For a comprehensive list of all configuration options, refer to the respective `.env.example` files in the backend and mobile directories.

## Project Structure

- `backend/`: Node.js Express server, AI orchestration, WebSocket handlers, and PostgreSQL migrations.
- `mobile/`: Flutter application containing UI components, local AI services, and state management.
- `dashboard/`: Next.js web application for tenant administration and moderation.
- `deploy/`: Systemd services, Prometheus scrape configurations, and infrastructure-as-code manifests.
- `infra/`: Terraform configurations for CDN and cloud resources.
- `scripts/`: Shell utilities for deployment, backup, and environment provisioning.
- `docs/`: Extensive documentation covering maintenance, runbooks, and client handoffs.

## Documentation

For deeper insights into operating, deploying, and extending Status, please review the following internal guides:

- `API_REFERENCE.md`: Comprehensive API endpoint specifications.
- `DEPLOYMENT.md`: Infrastructure requirements and release checklists.
- `MAINTENANCE.md` and `MAINTENANCE_HANDBOOK.md`: Maintenance procedures, observability, and scaling tactics.
- `OPERATIONS_RUNBOOK.md`: Troubleshooting workflows and disaster recovery plans.
- `CLIENT_HANDOFF.md`: Procedures for tenant provisioning and white-label operations.

## License

All rights reserved.
