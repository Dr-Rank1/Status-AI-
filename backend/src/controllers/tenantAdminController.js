import {
  getTenantBySlug,
  updateTenantTheme,
  updateTenantAiConfig,
  provisionTenant,
  listTenants,
} from '../services/tenantService.js';
import { query } from '../config/database.js';

export async function getPublicTheme(req, res) {
  res.json({
    data: {
      slug: req.tenant.slug,
      name: req.tenant.name,
      theme: req.tenant.theme_config,
    },
  });
}

export async function getTenantConfig(req, res) {
  res.json({
    data: {
      slug: req.tenant.slug,
      name: req.tenant.name,
      theme: req.tenant.theme_config,
      ai: req.tenant.ai_config,
      redisNamespace: req.tenant.redis_namespace,
    },
  });
}

export async function updateTheme(req, res) {
  const result = await updateTenantTheme(req.tenantId, req.body);
  res.json({ data: result });
}

export async function updateAiConfig(req, res) {
  const result = await updateTenantAiConfig(req.tenantId, req.body);
  res.json({ data: result });
}

export async function listUsersForModeration(req, res) {
  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const { rows } = await query(
    `SELECT id, username, email, display_name, reputation, is_admin, created_at
     FROM users WHERE tenant_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [req.tenantId, limit],
  );
  res.json({ data: rows });
}

export async function moderateUser(req, res) {
  const { userId } = req.params;
  const { action } = req.body;

  if (action === 'promote_admin') {
    await query(`UPDATE users SET is_admin = TRUE WHERE id = $1 AND tenant_id = $2`, [userId, req.tenantId]);
  } else if (action === 'revoke_admin') {
    await query(`UPDATE users SET is_admin = FALSE WHERE id = $1 AND tenant_id = $2`, [userId, req.tenantId]);
  }

  res.json({ data: { userId, action, applied: true } });
}

export async function listCharactersForTuning(req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, personality, bio, fandom, is_published
     FROM ai_characters WHERE tenant_id = $1 ORDER BY name`,
    [req.tenantId],
  );
  res.json({ data: rows });
}

export async function tuneCharacterPrompt(req, res) {
  const { characterId } = req.params;
  const { systemPrompt, tone, traits } = req.body;

  const personalityPatch = {};
  if (systemPrompt != null) personalityPatch.system_prompt = systemPrompt;
  if (tone != null) personalityPatch.tone = tone;
  if (traits != null) personalityPatch.traits = traits;

  const { rows } = await query(
    `UPDATE ai_characters
     SET personality = personality || $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, name, handle, personality`,
    [characterId, req.tenantId, JSON.stringify(personalityPatch)],
  );

  res.json({ data: rows[0] ?? null });
}

export async function createTenant(req, res) {
  const tenant = await provisionTenant(req.body);
  res.status(201).json({ data: tenant });
}

export async function listAllTenants(req, res) {
  const tenants = await listTenants();
  res.json({ data: tenants });
}
