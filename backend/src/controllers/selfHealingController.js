import {
  getSelfHealingStatus,
  inspectAndHeal,
  applyPatch,
  getRecentErrors,
} from '../services/selfHealing/selfHealingService.js';
import { runSelfHealingCycle } from '../workers/selfHealingDaemon.js';

export async function status(_req, res) {
  const data = await getSelfHealingStatus();
  res.json({ data });
}

export async function recentErrors(req, res) {
  const limit = Math.min(parseInt(req.query.limit ?? '25', 10), 100);
  res.json({ data: getRecentErrors(limit) });
}

export async function runCycle(_req, res) {
  const result = await runSelfHealingCycle();
  res.json({ data: result });
}

export async function inspect(_req, res) {
  const result = await inspectAndHeal();
  res.json({ data: result });
}

export async function hotApplyPatch(req, res) {
  const { patchId } = req.params;
  const patch = await applyPatch(patchId);
  res.json({ data: patch });
}
