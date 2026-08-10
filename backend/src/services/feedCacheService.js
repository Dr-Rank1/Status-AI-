import { getRedis } from '../config/redis.js';

const VERSION_KEY = 'feed:version';
const TTL_SECONDS = parseInt(process.env.FEED_CACHE_TTL ?? '60', 10);

async function getVersion() {
  const redis = getRedis();
  if (!redis) return '0';
  const v = await redis.get(VERSION_KEY);
  return v ?? '0';
}

function cacheKey(version, { limit, offset, fandom }) {
  return `feed:${version}:${fandom ?? 'all'}:${limit}:${offset}`;
}

export async function getCachedFeed(params) {
  const redis = getRedis();
  if (!redis) return null;

  const version = await getVersion();
  const key = cacheKey(version, params);
  const raw = await redis.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedFeed(params, payload) {
  const redis = getRedis();
  if (!redis) return;

  const version = await getVersion();
  const key = cacheKey(version, params);
  await redis.setEx(key, TTL_SECONDS, JSON.stringify(payload));
}

export async function invalidateFeedCache() {
  const redis = getRedis();
  if (!redis) return;
  await redis.incr(VERSION_KEY);
}
