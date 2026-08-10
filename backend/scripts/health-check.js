#!/usr/bin/env node
/**
 * Phase 30 — System diagnostics CLI.
 * Usage: npm run health:check
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const checks = [];

function ok(name, details = {}) {
  checks.push({ name, status: 'ok', ...details });
  console.log(`  ✓ ${name}`);
}

function warn(name, details = {}) {
  checks.push({ name, status: 'warn', ...details });
  console.log(`  ! ${name}${details.error ? ` — ${details.error}` : ''}`);
}

function fail(name, details = {}) {
  checks.push({ name, status: 'fail', ...details });
  console.log(`  ✗ ${name}${details.error ? ` — ${details.error}` : ''}`);
}

async function checkDatabase() {
  const { checkConnection, getPoolStats, checkHnswIndexIntegrity } = await import('../src/config/database.js');
  try {
    const conn = await checkConnection();
    const pool = getPoolStats();
    ok('postgresql', { now: conn.now, pool: pool.write });
    if (pool.write.waiting > 0) {
      warn('postgresql_pool_pressure', { waiting: pool.write.waiting });
    }
  } catch (err) {
    fail('postgresql', { error: err.message });
  }

  try {
    const hnsw = await checkHnswIndexIntegrity();
    if (hnsw.healthy) {
      ok('pgvector_hnsw', {
        indexes: hnsw.hnswIndexes.map((i) => i.indexname),
        rows: hnsw.rowCounts,
      });
    } else if (!hnsw.pgvectorInstalled) {
      warn('pgvector_hnsw', { error: 'vector extension not installed' });
    } else {
      warn('pgvector_hnsw', { error: 'HNSW index missing on character_memories' });
    }
  } catch (err) {
    warn('pgvector_hnsw', { error: err.message });
  }
}

async function checkRedis() {
  const { connectRedis, getRedis } = await import('../src/config/redis.js');
  try {
    let client = getRedis();
    if (!client) client = await connectRedis();
    if (!client) {
      warn('redis', { error: 'REDIS_URL not set — optional cache skipped' });
      return;
    }
    const pong = await client.ping();
    ok('redis', { ping: pong });
  } catch (err) {
    fail('redis', { error: err.message });
  }
}

async function checkAiProviders() {
  const { isVllmConfigured } = await import('../src/services/ai/vllmProvider.js');
  const providers = {
    mock: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    vllm: isVllmConfigured(),
  };

  const configured = Object.entries(providers).filter(([, v]) => v).map(([k]) => k);
  if (configured.length <= 1) {
    warn('ai_providers', { configured, error: 'only mock available' });
  } else {
    ok('ai_providers', { configured });
  }

  // Lightweight reachability for self-hosted vLLM
  if (providers.vllm) {
    const base = process.env.VLLM_BASE_URL ?? 'http://127.0.0.1:8000/v1';
    try {
      const res = await fetch(`${base.replace(/\/v1\/?$/, '')}/health`, { signal: AbortSignal.timeout(3000) }).catch(() =>
        fetch(`${base}/models`, { signal: AbortSignal.timeout(3000) }),
      );
      if (res?.ok) ok('vllm_reachable', { base });
      else warn('vllm_reachable', { error: `HTTP ${res?.status ?? 'timeout'}`, base });
    } catch (err) {
      warn('vllm_reachable', { error: err.message, base });
    }
  }
}

async function checkSla() {
  const { getSlaSnapshot } = await import('../src/observability/slaTelemetry.js');
  const snap = getSlaSnapshot();
  if (snap.sampleCount === 0) {
    warn('sla_window', { error: 'no samples yet (process just started)' });
  } else if (snap.healthy) {
    ok('sla_window', snap);
  } else {
    fail('sla_window', snap);
  }
}

async function main() {
  console.log('Status system diagnostics (Phase 30)\n');

  await checkDatabase();
  await checkRedis();
  await checkAiProviders();
  await checkSla();

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;

  console.log(`\nSummary: ${checks.length} checks — ${failed} fail, ${warned} warn`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('health:check crashed:', err);
  process.exit(2);
});
