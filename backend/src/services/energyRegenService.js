import { query } from '../config/database.js';
import { emitEnergyRecharged } from './socketService.js';
import { logger } from '../utils/logger.js';

export async function regenerateAllUserEnergy() {
  const { rows } = await query(
    `UPDATE energy_state
     SET energy_remaining = energy_max,
         reset_at = CURRENT_DATE,
         updated_at = NOW()
     WHERE reset_at < CURRENT_DATE
        OR energy_remaining < energy_max
     RETURNING user_id, energy_remaining, energy_max, reset_at`
  );

  logger.info(`[EnergyRegen] Replenished energy for ${rows.length} user(s)`);
  return rows;
}

export async function regenerateStaleEnergy() {
  const { rows } = await query(
    `UPDATE energy_state
     SET energy_remaining = energy_max,
         reset_at = CURRENT_DATE,
         updated_at = NOW()
     WHERE reset_at < CURRENT_DATE
     RETURNING user_id, energy_remaining, energy_max, reset_at`
  );

  if (rows.length > 0) {
    logger.info(`[EnergyRegen] Daily reset for ${rows.length} user(s)`);
    for (const row of rows) {
      emitEnergyRecharged(row.user_id, row);
    }
  }

  return rows;
}

export async function applyCooldownRegen(tickAmount = 5) {
  const maxPerTick = parseInt(process.env.ENERGY_COOLDOWN_AMOUNT ?? `${tickAmount}`, 10);

  const { rows } = await query(
    `UPDATE energy_state
     SET energy_remaining = LEAST(energy_remaining + $1, energy_max),
         updated_at = NOW()
     WHERE energy_remaining < energy_max
       AND reset_at = CURRENT_DATE
     RETURNING user_id, energy_remaining, energy_max`,
    [maxPerTick]
  );

  if (rows.length > 0) {
    logger.info(`[EnergyRegen] Cooldown tick +${maxPerTick} for ${rows.length} user(s)`);
    for (const row of rows) {
      if (row.energy_remaining >= row.energy_max) {
        emitEnergyRecharged(row.user_id, row);
      }
    }
  }

  return rows;
}
