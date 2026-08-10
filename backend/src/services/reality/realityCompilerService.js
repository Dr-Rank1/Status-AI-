/**
 * Phase 48 — Code-to-matter compiler (Node). Blueprint recipes only;
 * ambient-energy "physical node rendering" is simulated metadata.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

const FABRICATE = () => process.env.REALITY_FABRICATE === 'true';
const recipes = [];

/**
 * Compile a structural definition into a matter/compute-node recipe.
 */
export async function compileRealityBlueprint({
  definition = {},
  purpose = 'compute_node',
} = {}) {
  assertAgentsNotKilled();
  if (FABRICATE()) {
    throw new AppError(
      'Physical fabrication is disabled in this build (blueprint-only)',
      403,
      'REALITY_FABRICATE_DENIED',
    );
  }

  const body = JSON.stringify({ definition, purpose });
  const recipeId = `recipe-${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}`;
  const recipe = {
    recipeId,
    purpose,
    definition,
    energyJoulesEst: Buffer.byteLength(body) * 1e-6,
    ambientEnergyClaim: false,
    physicalNodeRendered: false,
    blueprintOnly: true,
    at: new Date().toISOString(),
  };
  recipes.unshift(recipe);
  if (recipes.length > 200) recipes.pop();

  await appendAuditEvent({
    type: 'reality.compile',
    actor: 'reality-compiler',
    action: 'blueprint',
    decision: 'blueprint_only',
    metadata: { recipeId, purpose },
  });

  logger.info(`[RealityCompiler] ${recipeId} purpose=${purpose}`);
  return recipe;
}

/**
 * Simulate scaling a virtual compute node from ambient energy (metadata only).
 */
export function simulateAmbientNodeScale({ recipeId, nodes = 1 } = {}) {
  const recipe = recipes.find((r) => r.recipeId === recipeId);
  if (!recipe) throw new AppError('Recipe not found', 404, 'REALITY_RECIPE_MISSING');
  return {
    recipeId,
    virtualNodes: Math.min(1024, Math.max(1, nodes)),
    physicalNodeRendered: false,
    note: 'Infinite physical scale is simulated; no base-reality matter created',
  };
}

export function getRealityCompilerConfig() {
  return {
    fabricate: FABRICATE(),
    blueprintOnly: true,
    recipes: recipes.length,
    nativePath: 'mobile/native/reality_compiler_bridge',
  };
}

export function resetRealityRecipes() {
  recipes.length = 0;
}
