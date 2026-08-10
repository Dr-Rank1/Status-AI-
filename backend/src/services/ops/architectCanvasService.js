/**
 * Phase 48 — Architect Canvas telemetry aggregate for Next.js dashboard.
 */

import { getArchitectTelemetry, listUniverses, getExNihiloConfig } from '../genesis/exNihiloGenesisEngine.js';
import { getCommandCenterSnapshot } from '../ops/agentCommandCenterService.js';
import { getMultiverseConfig } from '../multiverse/multiverseBranchSimulator.js';
import { getAkashicConfig } from '../akashic/akashicRecordService.js';
import { getRealityCompilerConfig } from '../reality/realityCompilerService.js';
import { getKillSwitchState } from '../security/globalKillSwitchService.js';

export async function getArchitectCanvasSnapshot() {
  const [command] = await Promise.all([getCommandCenterSnapshot()]);
  const telemetry = getArchitectTelemetry();
  const universeList = listUniverses({ limit: 20 });
  return {
    generatedAt: new Date().toISOString(),
    canvas: 'architect/v1',
    killSwitch: getKillSwitchState(),
    multiversal: {
      ...telemetry,
      universeCount: telemetry.universes,
      universeList,
      exNihilo: getExNihiloConfig(),
      multiverseEngine: getMultiverseConfig(),
    },
    entropy: {
      avgDecay: telemetry.avgEntropyDecay,
      paradoxResolutions: telemetry.crossRealityParadoxResolutions,
    },
    akashic: getAkashicConfig(),
    realityCompiler: getRealityCompilerConfig(),
    swarm: command.swarm,
    observability: command.observability,
    governance: command.governance,
  };
}
