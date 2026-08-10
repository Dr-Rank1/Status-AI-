import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * REST API load test — posts feed + DM messages under concurrent traffic.
 *
 * Run:
 *   k6 run loadtests/k6/rest-api-load.js
 *   k6 run -e VUS=100 -e DURATION=2m loadtests/k6/rest-api-load.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '2m';

export const options = {
  scenarios: {
    rest_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    'http_req_duration{name:GET /posts}': ['p(95)<500'],
    'http_req_duration{name:POST /messages}': ['p(95)<1200'],
  },
};

export function setup() {
  const email = __ENV.TEST_EMAIL || 'player@status.dev';
  const password = __ENV.TEST_PASSWORD || 'password123';

  const loginRes = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (loginRes.status !== 200) {
    throw new Error(`Setup login failed: ${loginRes.status} ${loginRes.body}`);
  }

  const token = loginRes.json('data.token');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const chars = http.get(`${API}/characters`, { headers });
  check(chars, { 'characters list ok': (r) => r.status === 200 });

  const list = chars.json('data') || [];
  const characterId = __ENV.CHARACTER_ID || (list[0] && list[0].id);

  if (!characterId) {
    throw new Error('No AI character available for message load test');
  }

  return { token, characterId };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const postsRes = http.get(`${API}/posts?limit=20`, {
    headers,
    tags: { name: 'GET /posts' },
  });

  check(postsRes, {
    'posts status 200': (r) => r.status === 200,
    'posts returns array': (r) => Array.isArray(r.json('data')),
  });

  if (postsRes.status === 200) {
    const posts = postsRes.json('data') || [];
    if (posts.length > 0) {
      const postId = posts[__ITER % posts.length].id;
      http.get(`${API}/posts/${postId}`, {
        headers,
        tags: { name: 'GET /posts/:id' },
      });
    }
  }

  const messageRes = http.post(
    `${API}/messages`,
    JSON.stringify({
      characterId: data.characterId,
      content: `Load test ping ${__VU}-${__ITER} at ${Date.now()}`,
    }),
    { headers, tags: { name: 'POST /messages' } },
  );

  check(messageRes, {
    'message accepted or rate limited': (r) => [200, 201, 409, 429].includes(r.status),
  });

  sleep(0.3 + Math.random() * 0.7);
}
