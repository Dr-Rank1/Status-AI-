export const ENERGY_COSTS = {
  post: 10,
  reply: 5,
  like: 1,
  dm: 8,
};

async function exec(client, text, params) {
  if (client) {
    return client.query(text, params);
  }
  const { query } = await import('../config/database.js');
  return query(text, params);
}

export async function ensureDailyReset(client, userId) {
  await exec(
    client,
    `UPDATE energy_state
     SET energy_remaining = energy_max,
         reset_at = CURRENT_DATE,
         updated_at = NOW()
     WHERE user_id = $1
       AND reset_at < CURRENT_DATE`,
    [userId]
  );
}

export async function getEnergyState(userId, client = null) {
  await ensureDailyReset(client, userId);

  const { rows } = await exec(
    client,
    `SELECT id, user_id, energy_remaining, energy_max, reset_at, updated_at
     FROM energy_state
     WHERE user_id = $1`,
    [userId]
  );

  return rows[0] ?? null;
}

export async function spendEnergy(userId, action, client = null) {
  const cost = ENERGY_COSTS[action];
  if (!cost) {
    const { AppError } = await import('../utils/errors.js');
    throw new AppError(`Unknown energy action: ${action}`, 400, 'VALIDATION_ERROR');
  }

  await ensureDailyReset(client, userId);

  const { rows } = await exec(
    client,
    `UPDATE energy_state
     SET energy_remaining = energy_remaining - $1,
         updated_at = NOW()
     WHERE user_id = $2
       AND reset_at = CURRENT_DATE
       AND energy_remaining >= $1
     RETURNING id, user_id, energy_remaining, energy_max, reset_at, updated_at`,
    [cost, userId]
  );

  if (rows.length === 0) {
    const state = await getEnergyState(userId, client);
    const { insufficientEnergy } = await import('../utils/errors.js');
    throw insufficientEnergy(action, cost, state?.energy_remaining);
  }

  return { state: rows[0], spent: cost, action };
}

export async function ensureEnergyState(userId, client = null) {
  const existing = await exec(
    client,
    `SELECT id FROM energy_state WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows.length === 0) {
    await exec(client, `INSERT INTO energy_state (user_id) VALUES ($1)`, [userId]);
  }
}
