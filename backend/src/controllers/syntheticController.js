import {
  runSimulationBatch,
  getSimulationStatus,
  exportCuratedFineTuningRecords,
} from '../services/syntheticSimulationService.js';
import { runSyntheticSimulatorWorker } from '../workers/syntheticSimulatorWorker.js';

export async function status(_req, res) {
  const runs = await getSimulationStatus();
  res.json({ data: { runs } });
}

export async function startBatch(req, res) {
  const personaCount = parseInt(req.body?.personaCount ?? '100', 10);
  const characterIds = req.body?.characterIds ?? null;
  const result = await runSimulationBatch({ personaCount, characterIds });
  res.status(result.blocked ? 403 : 200).json({ data: result });
}

export async function runWorker(_req, res) {
  const result = await runSyntheticSimulatorWorker();
  res.json({ data: result });
}

export async function exportCurated(req, res) {
  const runId = req.query.runId ?? null;
  const limit = parseInt(req.query.limit ?? '200', 10);
  const records = await exportCuratedFineTuningRecords({ runId, limit });
  res.json({ data: records, meta: { count: records.length } });
}
