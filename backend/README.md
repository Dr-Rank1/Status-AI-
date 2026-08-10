# Backend (Node.js)

## Layout

```
backend/
├── db/schema.sql
├── src/
│   ├── index.js
│   ├── config/database.js
│   ├── routes/index.js
│   ├── controllers/
│   ├── middleware/
│   └── services/
│       ├── ai/                  # OpenAI, Anthropic, mock providers
│       ├── aiService.js
│       ├── energyService.js
│       ├── relationshipService.js
│       ├── sentimentService.js
│       ├── sessionService.js
│       └── messageQueueService.js  # Async AI DM/post replies
```

## API (v1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/session` | Current mock user + energy |
| GET | `/api/v1/characters/explore` | Characters grouped by fandom + follow state |
| POST | `/api/v1/characters/:id/follow` | Follow character |
| DELETE | `/api/v1/characters/:id/follow` | Unfollow character |
| POST | `/api/v1/posts` | Create post (spends energy) |
| POST | `/api/v1/posts/:id/replies` | Reply; async AI if character post |
| POST | `/api/v1/messages` | Send DM; async AI reply |
| GET | `/api/v1/messages/threads` | Inbox (includes `ai_pending`) |
| GET | `/api/v1/messages/threads/:id` | Messages + `meta.aiPending` |
| POST | `/api/v1/messages/threads/character/:id` | Get or create DM thread |

## Relationship System

- `sentimentService.js` — heuristic sentiment on user messages
- `relationshipService.js` — updates affinity (-100..100), user reputation, follower counts
- Follow/unfollow adjusts `following_count` and character `follower_count`

## Async AI

DM and post replies return immediately after energy deduction. AI generation runs via `messageQueueService.js`. Clients poll thread messages until `meta.aiPending` is false.
