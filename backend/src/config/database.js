import pg from 'pg';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'async_hooks';
import { getReadRegion } from './geoRouting.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

export const tenantContext = new AsyncLocalStorage();

const writePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const replicaEntries = (process.env.DATABASE_READ_URLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const readPools = replicaEntries.map((entry, idx) => {
  if (entry.includes('=')) {
    const eq = entry.indexOf('=');
    return {
      region: entry.slice(0, eq).trim(),
      pool: new Pool({
        connectionString: entry.slice(eq + 1).trim(),
        max: parseInt(process.env.DB_READ_POOL_MAX ?? '15', 10),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    };
  }
  return {
    region: `replica-${idx}`,
    pool: new Pool({
      connectionString: entry,
      max: parseInt(process.env.DB_READ_POOL_MAX ?? '15', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  };
});

if (process.env.DATABASE_READ_URL) {
  readPools.push({
    region: process.env.DATABASE_READ_REGION ?? 'read-default',
    pool: new Pool({
      connectionString: process.env.DATABASE_READ_URL,
      max: parseInt(process.env.DB_READ_POOL_MAX ?? '15', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  });
}

function pickReadPool(req) {
  if (readPools.length === 0) return writePool;
  const targetRegion = getReadRegion(req);
  const match = readPools.find((r) => r.region === targetRegion);
  return match?.pool ?? readPools[0].pool;
}

writePool.on('error', (err) => {
  console.error('Unexpected PostgreSQL write pool error', err);
});

for (const { pool, region } of readPools) {
  pool.on('error', (err) => {
    logger.error(`[DB Read ${region}] pool error`, err.message);
  });
}

async function runWithTenantSession(pool, tenantId, bypassRls, fn) {
  if (!tenantId && !bypassRls) {
    return fn(pool);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (bypassRls) {
      await client.query(`SELECT set_config('app.bypass_rls', 'true', true)`);
    } else if (tenantId) {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query(text, params, options = {}) {
  const pool = options.read ? pickReadPool(options.req) : writePool;
  const store = tenantContext.getStore();
  const tenantId = options.tenantId ?? store?.tenantId ?? null;
  const bypassRls = options.bypassRls ?? store?.bypassRls ?? false;

  if (!tenantId && !bypassRls) {
    return pool.query(text, params);
  }

  return runWithTenantSession(pool, tenantId, bypassRls, (client) => client.query(text, params));
}

export async function queryRead(text, params, req = null) {
  return query(text, params, { read: true, req });
}

export async function withBypassRls(fn) {
  return tenantContext.run({ bypassRls: true }, fn);
}

export async function checkConnection() {
  const result = await writePool.query('SELECT NOW() AS now');
  return result.rows[0];
}

export function getPoolStats() {
  return {
    write: {
      total: writePool.totalCount,
      idle: writePool.idleCount,
      waiting: writePool.waitingCount,
      max: writePool.options?.max ?? null,
    },
    readReplicas: readPools.map(({ region, pool }) => ({
      region,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: pool.options?.max ?? null,
    })),
  };
}

export async function checkHnswIndexIntegrity() {
  const { rows: ext } = await writePool.query(
    `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`,
  );
  const { rows: idx } = await writePool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE tablename = 'character_memories'
       AND indexdef ILIKE '%hnsw%'`,
  );
  const { rows: counts } = await writePool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM character_memories) AS memory_rows,
       (SELECT COUNT(*)::int FROM character_memories WHERE embedding IS NOT NULL) AS embedded_rows`,
  ).catch(() => ({ rows: [{ memory_rows: null, embedded_rows: null }] }));

  return {
    pgvectorInstalled: ext.length > 0,
    extension: ext[0] ?? null,
    hnswIndexes: idx,
    hnswIndexPresent: idx.length > 0,
    rowCounts: counts[0] ?? null,
    healthy: ext.length > 0 && idx.length > 0,
  };
}

export async function checkReadReplicas() {
  const checks = await Promise.all(
    readPools.map(async ({ region, pool }) => {
      try {
        const { rows } = await pool.query('SELECT NOW() AS now');
        return { region, status: 'ok', now: rows[0]?.now };
      } catch (err) {
        return { region, status: 'error', error: err.message };
      }
    }),
  );
  return checks;
}

export default writePool;
