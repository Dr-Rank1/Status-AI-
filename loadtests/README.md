# Status Load Tests (k6)

Stress-test the backend under concurrent REST and Socket.io traffic.

## Prerequisites

```bash
# Install k6 — https://grafana.com/docs/k6/latest/set-up/install-k6/
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
```

Start the full stack:

```bash
docker compose up -d db redis
cd backend && npm run dev
```

## REST API load (`/api/v1/posts`, `/api/v1/messages`)

```bash
k6 run loadtests/k6/rest-api-load.js
k6 run -e VUS=150 -e DURATION=3m loadtests/k6/rest-api-load.js
```

Monitors: PostgreSQL pool saturation, Redis feed cache hit rate (via `/metrics`).

## WebSocket load (Engine.IO / Socket.io polling)

Simulates hundreds of concurrent authenticated realtime connections:

```bash
k6 run loadtests/k6/websocket-load.js
k6 run -e VUS=300 -e DURATION=5m loadtests/k6/websocket-load.js
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | API origin |
| `TEST_EMAIL` | `player@status.dev` | Load-test account |
| `TEST_PASSWORD` | `password123` | Load-test password |
| `CHARACTER_ID` | first character | Target for DM spam |
| `VUS` | `100` / `200` | Virtual users |
| `DURATION` | `2m` / `3m` | Steady-state duration |

Watch Grafana/Prometheus during runs:

```bash
curl http://localhost:3000/metrics | rg 'http_request_duration|process_cpu|nodejs_heap'
journalctl -u status-backend -f
```
