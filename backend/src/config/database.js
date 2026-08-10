import pg from 'pg';
import dotenv from 'dotenv';
import { getReadRegion } from './geoRouting.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

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

export async function query(text, params, options = {}) {
  const pool = options.read ? pickReadPool(options.req) : writePool;
  return pool.query(text, params);
}

export async function queryRead(text, params, req = null) {
  return query(text, params, { read: true, req });
}

export async function checkConnection() {
  const result = await writePool.query('SELECT NOW() AS now');
  return result.rows[0];
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
