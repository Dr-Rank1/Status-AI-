/**
 * Global CDN URL helpers for edge-cached static assets.
 */

const CDN_BASE = (process.env.CDN_BASE_URL ?? '').replace(/\/$/, '');
const CDN_ENABLED = Boolean(CDN_BASE);

const ASSET_PREFIXES = {
  uploads: process.env.CDN_UPLOADS_PREFIX ?? '/media',
  models: process.env.CDN_MODELS_PREFIX ?? '/avatars-3d',
};

export function isCdnEnabled() {
  return CDN_ENABLED;
}

export function cdnUrl(path, { assetType = 'uploads' } = {}) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (!CDN_ENABLED) return path;
    try {
      const url = new URL(path);
      const prefix = ASSET_PREFIXES[assetType] ?? ASSET_PREFIXES.uploads;
      return `${CDN_BASE}${prefix}${url.pathname}`;
    } catch {
      return path;
    }
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!CDN_ENABLED) return normalized;

  const prefix = ASSET_PREFIXES[assetType] ?? ASSET_PREFIXES.uploads;
  return `${CDN_BASE}${prefix}${normalized}`;
}

export function cdnUrlForGlb(url) {
  return cdnUrl(url, { assetType: 'models' });
}

export function cdnCacheHeaders(maxAgeSec = 86400) {
  return {
    'Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=3600`,
    'CDN-Cache-Control': `max-age=${maxAgeSec}`,
  };
}

export function transformFeedMediaUrls(post) {
  if (!CDN_ENABLED || !post) return post;

  return {
    ...post,
    image_url: cdnUrl(post.image_url),
    avatar_cdn_url: post.model_3d_url ? cdnUrlForGlb(post.model_3d_url) : null,
  };
}
