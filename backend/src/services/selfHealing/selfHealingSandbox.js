/**
 * Isolated sandbox for evaluating self-healing patches before hot-apply.
 */

import { logger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.SELF_HEALING_SANDBOX_TIMEOUT_MS ?? '5000', 10);

export async function evaluatePatchInSandbox(patch, testCases = []) {
  const started = Date.now();
  const results = [];

  for (const testCase of testCases) {
    try {
      const outcome = await runSandboxCase(patch, testCase);
      results.push({ ...testCase, passed: outcome.passed, detail: outcome.detail });
    } catch (err) {
      results.push({ ...testCase, passed: false, detail: err.message });
    }
  }

  if (results.length === 0) {
    const synthetic = await runSyntheticValidation(patch);
    results.push(synthetic);
  }

  const passed = results.filter((r) => r.passed).length;
  const passRate = results.length ? passed / results.length : 0;
  const minRate = parseFloat(process.env.SELF_HEALING_MIN_PASS_RATE ?? '0.8');

  return {
    passed: passRate >= minRate,
    passRate,
    results,
    durationMs: Date.now() - started,
  };
}

async function runSandboxCase(patch, testCase) {
  const timeout = patch.sandboxTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return Promise.race([
    simulatePatchResponse(patch, testCase),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sandbox timeout')), timeout);
    }),
  ]);
}

async function simulatePatchResponse(patch, testCase) {
  const { patchType, patchConfig } = patch;

  if (patchType === 'fallback_response') {
    const status = patchConfig?.status ?? 200;
    const body = patchConfig?.body ?? { data: null };
    const ok = status >= 200 && status < 300;
    const shapeOk = testCase.expectedKeys
      ? testCase.expectedKeys.every((k) => bodyHasKey(body, k))
      : true;
    return { passed: ok && shapeOk, detail: { status, keys: Object.keys(body) } };
  }

  if (patchType === 'queue_retry') {
    const retryAfter = patchConfig?.retryAfterSec ?? 30;
    return {
      passed: retryAfter > 0 && retryAfter <= 120,
      detail: { retryAfterSec: retryAfter },
    };
  }

  return { passed: false, detail: 'Unknown patch type' };
}

async function runSyntheticValidation(patch) {
  if (!patch.routePattern) {
    return { name: 'synthetic', passed: false, detail: 'Missing route pattern' };
  }

  logger.debug(`[SelfHealing Sandbox] Synthetic validation for ${patch.routePattern}`);
  return {
    name: 'synthetic_route_check',
    passed: Boolean(patch.patchConfig),
    detail: 'Config present',
  };
}

function bodyHasKey(obj, key) {
  if (obj == null || typeof obj !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  return Object.values(obj).some((v) => typeof v === 'object' && bodyHasKey(v, key));
}
