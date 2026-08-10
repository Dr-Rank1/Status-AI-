import { query } from '../config/database.js';
import { emitEnergyRecharged } from './socketService.js';
import { logger } from '../utils/logger.js';

const REWARD_AMOUNTS = {
  dm: parseInt(process.env.CREATOR_REWARD_DM ?? '3', 10),
  follow: parseInt(process.env.CREATOR_REWARD_FOLLOW ?? '5', 10),
  post_reply: parseInt(process.env.CREATOR_REWARD_REPLY ?? '2', 10),
};

export async function rewardCreatorOnInteraction({ characterId, actorUserId, rewardType }) {
  const amount = REWARD_AMOUNTS[rewardType];
  if (!amount || amount <= 0) return null;

  const { rows } = await query(
    `SELECT id, creator_user_id, name FROM ai_characters
     WHERE id = $1 AND creator_user_id IS NOT NULL`,
    [characterId]
  );

  if (rows.length === 0) return null;

  const character = rows[0];
  if (character.creator_user_id === actorUserId) return null;

  const energyUpdate = await query(
    `UPDATE energy_state
     SET energy_remaining = LEAST(energy_remaining + $1, energy_max + 50),
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING energy_remaining, energy_max, reset_at`,
    [amount, character.creator_user_id]
  );

  if (energyUpdate.rows.length === 0) return null;

  await query(
    `UPDATE ai_characters SET creator_energy_earned = creator_energy_earned + $1 WHERE id = $2`,
    [amount, characterId]
  );

  await query(
    `INSERT INTO creator_rewards (creator_user_id, character_id, actor_user_id, reward_type, energy_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [character.creator_user_id, characterId, actorUserId, rewardType, amount]
  );

  const energy = energyUpdate.rows[0];
  emitEnergyRecharged(character.creator_user_id, energy);

  logger.info(
    `[CreatorReward] +${amount} energy to creator of @${character.name} (${rewardType})`
  );

  return { creatorUserId: character.creator_user_id, amount, rewardType };
}
