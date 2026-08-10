import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { validateBody } from '../src/middleware/validate.js';
import { securityHeaders } from '../src/middleware/security.js';
import { loginSchema, registerSchema } from '../src/validation/schemas.js';

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

describe('security validation', () => {
  it('rejects invalid register payloads', async () => {
    const app = express();
    app.use(express.json());
    app.post('/register', validateBody(registerSchema), (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    const server = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'ab',
          email: 'not-an-email',
          password: 'short',
          displayName: '',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.error, 'VALIDATION_ERROR');
      assert.ok(body.message.length > 0);
    } finally {
      await server.close();
    }
  });

  it('sanitizes and accepts valid login payloads', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', validateBody(loginSchema), (req, res) => {
      res.json({ email: req.body.email });
    });

    const server = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '  player@status.dev  ', password: 'password123' }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.email, 'player@status.dev');
    } finally {
      await server.close();
    }
  });
});

describe('security headers', () => {
  it('sets helmet headers on responses', async () => {
    const app = express();
    app.use(securityHeaders());
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const server = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/ping`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('x-content-type-options'));
      assert.ok(res.headers.get('x-frame-options'));
    } finally {
      await server.close();
    }
  });
});
