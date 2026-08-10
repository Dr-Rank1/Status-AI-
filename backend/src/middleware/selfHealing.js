/**
 * Payload shape guard + runtime error capture for self-healing pipeline.
 */

import { recordPayloadShift, recordRuntimeError } from '../services/selfHealing/selfHealingService.js';

const PAYLOAD_SCHEMAS = {
  '/api/v1/posts': { required: [], optional: ['content', 'mediaUrl', 'mediaType', 'characterMentions'] },
  '/api/v1/messages': { required: ['threadId', 'content'], optional: ['encryptedPayload'] },
  '/api/v1/spatial/react': { required: ['characterId', 'message'], optional: ['spatial', 'sceneKey'] },
  '/api/v1/spatial/context': { required: ['spatial'], optional: ['characterId', 'zoneLabel'] },
  '/api/v1/bci/intent': { required: ['valence', 'arousal', 'intentType'], optional: ['focusLevel', 'characterId'] },
};

export function payloadShapeGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'DELETE') return next();
  if (!req.body || typeof req.body !== 'object') return next();

  const routeKey = normalizeRouteKey(req.originalUrl ?? req.path);
  const schema = PAYLOAD_SCHEMAS[routeKey];
  if (!schema) return next();

  const keys = Object.keys(req.body);
  const unknown = keys.filter((k) => !schema.required.includes(k) && !schema.optional.includes(k));

  if (unknown.length > 3) {
    recordPayloadShift(req, {
      message: `Unexpected fields: ${unknown.slice(0, 5).join(', ')}`,
      unknownFields: unknown,
    });
  }

  const missing = schema.required.filter((k) => !(k in req.body));
  if (missing.length > 0 && Object.keys(req.body).length > 0) {
    recordPayloadShift(req, {
      message: `Missing required fields: ${missing.join(', ')}`,
      missingFields: missing,
    });
  }

  return next();
}

export function captureErrorForHealing(err, req, res, next) {
  if ((err.status ?? 500) >= 500) {
    recordRuntimeError(err, req);
  }
  next(err);
}

function normalizeRouteKey(url) {
  const base = String(url ?? '').split('?')[0];
  const stripped = base.replace(/\/[0-9a-f-]{36}/gi, '');
  if (stripped.startsWith('/api/v1')) return stripped;
  return `/api/v1${stripped.startsWith('/') ? '' : '/'}${stripped}`;
}
