# Phase 34 — Serverless Agent Swarm

Stateless MCP (`2026-07-28`) edge workers for infinite scale-out / scale-to-zero.

## Cloudflare Workers

```bash
cd deploy/serverless/agent-swarm
# wrangler secret put STATUS_MCP_ORIGIN
npx wrangler deploy
```

Set `MCP_SWARM_BACKEND=cloudflare` and `MCP_SWARM_WORKER_URL=https://<worker>/` on the API.

## Google Cloud Run

```bash
gcloud run deploy status-agent-swarm \
  --source deploy/serverless/agent-swarm \
  --min-instances=0 \
  --max-instances=200 \
  --region=us-central1
```

Or apply `cloudrun.yaml` after substituting `PROJECT_ID`.

## Contract

| Header | Purpose |
|--------|---------|
| `Mcp-Method` | `tools/list`, `tools/call`, `mrtr/pause`, … |
| `Mcp-Name` | Tool or resource name |
| `Mcp-Protocol-Version` | `2026-07-28` |
| `X-MCP-Agent-Token` | Phase 33 RBAC identity |

No sticky sessions — MRTR `requestState` is stored in Redis/Postgres.
