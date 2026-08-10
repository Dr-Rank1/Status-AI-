/**
 * Tenant resolution, provisioning, and theme/AI config management.
 */

import crypto from 'crypto';
import { query, withBypassRls } from '../config/database.js';
import { AppError, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const tenantCache = new Map();
const CACHE_TTL_MS = 60_000;

export async function getTenantBySlug(slug) {
  const key = slug.toLowerCase();
  const cached = tenantCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.tenant;
  }

  const { rows } = await withBypassRls(() => query(
    `SELECT id, slug, name, redis_namespace, theme_config, ai_config, is_active, created_at
     FROM tenants WHERE slug = $1 AND is_active = TRUE`,
    [key],
  ));

  const tenant = rows[0] ?? null;
  if (tenant) tenantCache.set(key, { tenant, at: Date.now() });
  return tenant;
}

export async function getTenantById(id) {
  const { rows } = await withBypassRls(() => query(
    `SELECT id, slug, name, redis_namespace, theme_config, ai_config, is_active, created_at
     FROM tenants WHERE id = $1`,
    [id],
  ));
  return rows[0] ?? null;
}

export async function provisionTenant({
  slug,
  name,
  themeConfig = {},
  aiConfig = {},
}) {
  if (!slug || !name) {
    throw new AppError('slug and name are required', 400, 'VALIDATION_ERROR');
  }

  const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const redisNamespace = `status:${normalized}`;

  const defaultTheme = {
    appName: name,
    primaryColor: '#8B5CF6',
    accentColor: '#22D3EE',
    backgroundColor: '#0A0A0B',
    surfaceColor: '#141416',
    fontFamily: 'Inter',
    logoUrl: null,
  };

  const { rows } = await withBypassRls(() => query(
    `INSERT INTO tenants (slug, name, redis_namespace, theme_config, ai_config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, slug, name, redis_namespace, theme_config, ai_config, created_at`,
    [
      normalized,
      name,
      redisNamespace,
      JSON.stringify({ ...defaultTheme, ...themeConfig }),
      JSON.stringify(aiConfig),
    ],
  ));

  logger.info(`[Tenant] Provisioned: ${normalized}`);
  tenantCache.delete(normalized);
  return rows[0];
}

export async function updateTenantTheme(tenantId, themeConfig) {
  const { rows } = await query(
    `UPDATE tenants SET theme_config = theme_config || $2::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING id, slug, theme_config`,
    [tenantId, JSON.stringify(themeConfig)],
  );
  if (!rows[0]) throw notFound('Tenant');
  tenantCache.clear();
  return rows[0];
}

export async function updateTenantAiConfig(tenantId, aiConfig) {
  const { rows } = await query(
    `UPDATE tenants SET ai_config = ai_config || $2::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING id, slug, ai_config`,
    [tenantId, JSON.stringify(aiConfig)],
  );
  if (!rows[0]) throw notFound('Tenant');
  return rows[0];
}

export async function listTenants() {
  const { rows } = await withBypassRls(() => query(
    `SELECT id, slug, name, redis_namespace, is_active, created_at FROM tenants ORDER BY created_at DESC`,
  ));
  return rows;
}

export function generateTenantApiKey() {
  return `st_${crypto.randomBytes(24).toString('base64url')}`;
}

export async function assertUserBelongsToTenant(userId, tenantId) {
  const { rows } = await query(
    `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  if (!rows[0]) {
    throw new AppError('User does not belong to this tenant', 403, 'TENANT_FORBIDDEN');
  }
}
