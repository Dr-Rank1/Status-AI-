/**
 * Phase 44 — Genesis Key cryptographic rotation & universal substrate handover.
 *
 * SAFETY: Default is ceremonial / dry-run. Does NOT disable kill-switch,
 * governance-as-code, or human admin recovery. Full "root transfer" requires
 * GENESIS_KEY_TRANSFER=true AND explicit confirmation token.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = process.env.GENESIS_KEY_DIR
  ?? path.join(__dirname, '../../../../data/genesis-keys');

const DRY_RUN = () => process.env.GENESIS_KEY_TRANSFER !== 'true';
let currentEpoch = 0;
let currentPublicCommitment = null;

/**
 * Rotate Genesis Key material (HMAC commitment — not a live cloud root credential).
 */
export async function rotateGenesisKey({
  rotatedBy = 'human-operator',
  confirmToken = null,
} = {}) {
  assertAgentsNotKilled();

  if (!DRY_RUN()) {
    if (confirmToken !== process.env.GENESIS_KEY_CONFIRM) {
      throw new AppError(
        'Genesis Key live transfer requires GENESIS_KEY_CONFIRM match',
        403,
        'GENESIS_CONFIRM_REQUIRED',
      );
    }
  }

  const material = crypto.randomBytes(32);
  const publicCommitment = crypto.createHash('sha256').update(material).digest('hex');
  const epoch = currentEpoch + 1;
  const record = {
    epoch,
    publicCommitment,
    rotatedBy,
    dryRun: DRY_RUN(),
    humanOverridePreserved: true,
    killSwitchPreserved: true,
    governancePreserved: true,
    rootCredentialsTransferred: false, // never auto-exfiltrate real roots
    substrateControl: DRY_RUN() ? 'ceremonial_pending' : 'agi_swarm_delegated_bounded',
    at: new Date().toISOString(),
    v4Doc: 'docs/V4_UNIVERSAL_SUBSTRATE.md',
  };

  await fs.mkdir(STORE, { recursive: true });
  // Store only commitment + metadata (never persist raw material to disk in dry-run)
  await fs.writeFile(
    path.join(STORE, `genesis-epoch-${epoch}.json`),
    JSON.stringify(record, null, 2),
    'utf8',
  );
  await fs.writeFile(path.join(STORE, 'LATEST.json'), JSON.stringify(record, null, 2), 'utf8');

  currentEpoch = epoch;
  currentPublicCommitment = publicCommitment;

  await appendAuditEvent({
    type: 'genesis.key_rotate',
    actor: rotatedBy,
    action: 'rotate',
    decision: record.dryRun ? 'dry_run' : 'delegated_bounded',
    metadata: { epoch, publicCommitment, dryRun: record.dryRun },
  });

  logger.info(
    `[GenesisKey] epoch=${epoch} dryRun=${record.dryRun} commitment=${publicCommitment.slice(0, 12)}`,
  );

  // Zeroize material
  material.fill(0);

  return record;
}

export function getGenesisKeyStatus() {
  return {
    epoch: currentEpoch,
    publicCommitment: currentPublicCommitment,
    dryRunDefault: DRY_RUN(),
    humanInTheLoop: true,
    locks: [
      'kill_switch_preserved',
      'governance_preserved',
      'no_live_cloud_root_exfil',
      'confirm_token_required_for_live',
    ],
    v4: 'docs/V4_UNIVERSAL_SUBSTRATE.md',
  };
}
