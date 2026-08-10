/**
 * Multi-tenant middleware — resolves tenant context and enforces isolation scope.
 */

import { tenantContext } from '../config/database.js';
import { getTenantBySlug, assertUserBelongsToTenant } from '../services/tenantService.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const DEFAULT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? 'default';

export async function tenantResolverMiddleware(req, res, next) {
  try {
    const slug = (
      req.headers['x-tenant-slug']
      ?? req.headers['x-tenant-id']
      ?? extractSubdomain(req.hostname)
      ?? DEFAULT_SLUG
    ).toString().toLowerCase();

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return next(new AppError(`Unknown tenant: ${slug}`, 404, 'TENANT_NOT_FOUND'));
    }

    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.tenantSlug = tenant.slug;
    req.redisNamespace = tenant.redis_namespace;
    next();
  } catch (err) {
    next(err);
  }
}

export function tenantScopeMiddleware(req, res, next) {
  if (!req.tenantId) {
    return next(new AppError('Tenant context missing', 500, 'TENANT_CONTEXT_ERROR'));
  }

  tenantContext.run({ tenantId: req.tenantId, tenantSlug: req.tenantSlug }, () => next());
}

export async function validateUserTenantMiddleware(req, res, next) {
  if (!req.user?.id || !req.tenantId) return next();

  try {
    await assertUserBelongsToTenant(req.user.id, req.tenantId);
    req.user.tenant_id = req.tenantId;
    next();
  } catch (err) {
    next(err);
  }
}

function extractSubdomain(hostname) {
  if (!hostname || hostname === 'localhost') return null;
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'api') {
    return parts[0];
  }
  return null;
}

export function logTenantRequest(req, _res, next) {
  if (req.tenantSlug) {
    logger.debug(`[Tenant] ${req.method} ${req.path} → ${req.tenantSlug}`);
  }
  next();
}
