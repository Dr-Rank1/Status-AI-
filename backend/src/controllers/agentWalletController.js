import { getWalletSummary, listCharacterWallets } from '../services/agentWalletService.js';
import { runPeriodicTipSweep } from '../services/agentTipService.js';

export async function getCharacterWallet(req, res) {
  const { characterId } = req.params;
  const data = await getWalletSummary(characterId);
  res.json({ data });
}

export async function listWallets(req, res) {
  const data = await listCharacterWallets();
  res.json({ data });
}

export async function runTipSweep(req, res) {
  const results = await runPeriodicTipSweep();
  res.json({ data: results, count: results.length });
}
