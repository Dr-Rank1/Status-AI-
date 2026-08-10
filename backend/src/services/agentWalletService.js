/**
 * Per-character agent wallets — Lightning + in-app energy/token micropayments.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_ENERGY_POOL = parseInt(process.env.AGENT_WALLET_ENERGY_POOL ?? '500', 10);

export async function getOrCreateWallet(characterId, client = null) {
  const exec = client ? (text, params) => client.query(text, params) : query;

  const existing = await exec(
    `SELECT * FROM agent_wallets WHERE character_id = $1`,
    [characterId],
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const lightningAddress = `status-${characterId.slice(0, 8)}@lightning.local`;
  const web3Address = `0x${crypto.createHash('sha256').update(characterId).digest('hex').slice(0, 40)}`;

  const { rows } = await exec(
    `INSERT INTO agent_wallets (character_id, lightning_address, web3_address, energy_pool)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [characterId, lightningAddress, web3Address, DEFAULT_ENERGY_POOL],
  );

  return rows[0];
}

export async function creditWallet({ characterId, amount, currency = 'energy', reason, metadata = {} }) {
  const column = currency === 'token' ? 'token_balance' : 'energy_pool';
  const wallet = await getOrCreateWallet(characterId);

  const { rows } = await query(
    `UPDATE agent_wallets
     SET ${column} = ${column} + $1, updated_at = NOW()
     WHERE character_id = $2
     RETURNING *`,
    [amount, characterId],
  );

  await query(
    `INSERT INTO agent_wallet_transactions
       (wallet_id, character_id, tx_type, amount, currency, reason, metadata)
     VALUES ($1, $2, 'credit', $3, $4, $5, $6)`,
    [wallet.id, characterId, amount, currency, reason ?? null, JSON.stringify(metadata)],
  );

  return rows[0];
}

export async function debitWallet({ characterId, amount, currency = 'energy', reason, metadata = {} }) {
  const column = currency === 'token' ? 'token_balance' : 'energy_pool';
  const wallet = await getOrCreateWallet(characterId);

  const { rows } = await query(
    `UPDATE agent_wallets
     SET ${column} = ${column} - $1, updated_at = NOW()
     WHERE character_id = $2 AND ${column} >= $1
     RETURNING *`,
    [amount, characterId],
  );

  if (rows.length === 0) {
    return null;
  }

  await query(
    `INSERT INTO agent_wallet_transactions
       (wallet_id, character_id, tx_type, amount, currency, reason, metadata)
     VALUES ($1, $2, 'debit', $3, $4, $5, $6)`,
    [wallet.id, characterId, amount, currency, reason ?? null, JSON.stringify(metadata)],
  );

  return rows[0];
}

export async function tipUser({
  characterId,
  userId,
  energyAmount = 5,
  tokenAmount = 0,
  reason,
  metadata = {},
}) {
  const wallet = await debitWallet({
    characterId,
    amount: energyAmount,
    currency: 'energy',
    reason,
    metadata,
  });

  if (!wallet) {
    logger.warn(`[AgentWallet] Insufficient energy pool for character ${characterId}`);
    return null;
  }

  const { rows: energyRows } = await query(
    `UPDATE energy_state
     SET energy_remaining = LEAST(energy_remaining + $1, energy_max + $1),
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING energy_remaining, energy_max`,
    [energyAmount, userId],
  );

  if (tokenAmount > 0) {
    await debitWallet({
      characterId,
      amount: tokenAmount,
      currency: 'token',
      reason: `${reason} (token bonus)`,
      metadata,
    });

    await query(
      `UPDATE ai_characters
       SET creator_energy_earned = COALESCE(creator_energy_earned, 0) + $1
       WHERE id = $2 AND creator_user_id = $3`,
      [tokenAmount, characterId, userId],
    ).catch(() => {});
  }

  await query(
    `INSERT INTO agent_wallet_transactions
       (wallet_id, character_id, recipient_user_id, tx_type, amount, currency, reason, metadata)
     VALUES ($1, $2, $3, 'tip', $4, 'energy', $5, $6)`,
    [
      wallet.id,
      characterId,
      userId,
      energyAmount,
      reason ?? 'community_tip',
      JSON.stringify({ ...metadata, tokenBonus: tokenAmount }),
    ],
  );

  try {
    const { emitEnergyRecharged } = await import('./socketService.js');
    if (energyRows[0]) {
      emitEnergyRecharged(userId, energyRows[0]);
    }
  } catch {
    // non-fatal
  }

  return {
    energyGranted: energyAmount,
    tokenGranted: tokenAmount,
    wallet,
    energyState: energyRows[0] ?? null,
  };
}

export async function getWalletSummary(characterId) {
  const wallet = await getOrCreateWallet(characterId);
  const { rows: recent } = await query(
    `SELECT tx_type, amount, currency, reason, recipient_user_id, created_at
     FROM agent_wallet_transactions
     WHERE character_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [characterId],
  );

  return { wallet, recentTips: recent };
}

export async function listCharacterWallets({ limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT w.*, c.name AS character_name, c.handle AS character_handle
     FROM agent_wallets w
     JOIN ai_characters c ON c.id = w.character_id
     WHERE c.is_active = TRUE
     ORDER BY w.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
