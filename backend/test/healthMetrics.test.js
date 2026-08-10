import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { live, ready } from '../src/controllers/healthController.js';
import { metricsHandler, register } from '../src/observability/metrics.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({
        port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function getText(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.text();
  return { status: res.status, body, contentType: res.headers.get('content-type') };
}

describe('healthController', () => {
  it('live returns ok', async () => {
    const app = express();
    app.get('/live', live);
    const server = await listen(app);

    try {
      const { status, body } = await getJson(server.port, '/live');
      assert.equal(status, 200);
      assert.equal(body.status, 'ok');
      assert.equal(body.service, 'status-api');
    } finally {
      await server.close();
    }
  });

  it('ready reports dependency checks', async () => {
    const app = express();
    app.get('/ready', ready);
    const server = await listen(app);

    try {
      const { status, body } = await getJson(server.port, '/ready');
      assert.ok([200, 503].includes(status));
      assert.ok(['ready', 'degraded'].includes(body.status));
      assert.ok(body.checks.database);
      assert.ok(body.checks.redis);
      assert.ok(typeof body.uptime_seconds === 'number');
    } finally {
      await server.close();
    }
  });
});

describe('metrics', () => {
  it('exposes Prometheus text format', async () => {
    const app = express();
    app.get('/metrics', metricsHandler);
    const server = await listen(app);

    try {
      const { status, body, contentType } = await getText(server.port, '/metrics');
      assert.equal(status, 200);
      assert.match(contentType ?? '', /text\/plain/);
      assert.match(body, /process_cpu_user_seconds_total/);
      assert.match(body, /http_request_duration_seconds/);
    } finally {
      await server.close();
    }
  });

  it('register exposes default Node.js metrics', async () => {
    const metrics = await register.metrics();
    assert.match(metrics, /nodejs_heap_size_total_bytes/);
  });
});
