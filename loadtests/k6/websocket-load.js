import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * WebSocket / Socket.io connection load test via Engine.IO long-polling.
 * Simulates hundreds of concurrent authenticated realtime clients.
 *
 * Run:
 *   k6 run loadtests/k6/websocket-load.js
 *   k6 run -e VUS=200 -e DURATION=3m loadtests/k6/websocket-load.js
 *
 * Stresses: socket auth middleware, connection pool, Redis session cache.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const VUS = Number(__ENV.VUS || 200);
const DURATION = __ENV.DURATION || '3m';
const POLL_INTERVAL = Number(__ENV.POLL_INTERVAL || 2);

export const options = {
  scenarios: {
    socket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '45s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.08'],
    'checks{name:socket handshake}': ['rate>0.90'],
    'checks{name:socket authenticated}': ['rate>0.85'],
  },
};

export function setup() {
  const email = __ENV.TEST_EMAIL || 'player@status.dev';
  const password = __ENV.TEST_PASSWORD || 'password123';

  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    throw new Error(`Login failed during setup: ${res.status}`);
  }

  return { token: res.json('data.token') };
}

function engineIoHandshake() {
  return http.get(`${BASE_URL}/socket.io/?EIO=4&transport=polling`, {
    tags: { name: 'socket.io handshake' },
  });
}

function parseSid(body) {
  if (!body || body.length < 1) return null;
  const payload = body.startsWith('0') ? body.slice(1) : body;
  try {
    const json = JSON.parse(payload);
    return json.sid || null;
  } catch {
    return null;
  }
}

export default function (data) {
  const handshake = engineIoHandshake();
  const sid = parseSid(handshake.body);

  check(handshake, {
    'socket handshake': (r) => r.status === 200 && !!sid,
  });

  if (!sid) {
    sleep(1);
    return;
  }

  const connectPayload = `40${JSON.stringify({ token: data.token })}`;
  const connectRes = http.post(
    `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}`,
    connectPayload,
    {
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      tags: { name: 'socket.io connect' },
    },
  );

  check(connectRes, {
    'socket authenticated': (r) => r.status === 200,
  });

  for (let i = 0; i < 3; i++) {
    http.get(`${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
      tags: { name: 'socket.io poll' },
    });
    sleep(POLL_INTERVAL);
  }

  http.post(
    `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}`,
    '1',
    {
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      tags: { name: 'socket.io disconnect' },
    },
  );
}
