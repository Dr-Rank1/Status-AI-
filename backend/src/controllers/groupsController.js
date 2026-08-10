import pool, { query } from '../config/database.js';
import { ENERGY_COSTS, spendEnergy } from '../services/energyService.js';
import { requireContentModeration } from '../middleware/moderation.js';
import { validationError } from '../utils/errors.js';
import {
  createGroup,
  listGroupsForUser,
  getGroupMessages,
  insertGroupMessage,
  getGroupMemberUserIds,
} from '../services/groupChatService.js';
import { queueGroupAiReplies, isGroupAiPending } from '../services/messageQueueService.js';
import { logEvent } from '../services/analyticsService.js';

export async function listGroups(req, res) {
  const groups = await listGroupsForUser(req.user.id);
  const data = groups.map((g) => ({ ...g, ai_pending: isGroupAiPending(g.id) }));
  res.json({ data });
}

export async function createGroupThread(req, res) {
  const { name, characterIds, userIds } = req.body;
  const group = await createGroup({
    creatorId: req.user.id,
    name,
    characterIds: characterIds ?? [],
    userIds: userIds ?? [],
  });
  res.status(201).json({ data: group });
}

export async function getMessages(req, res) {
  const result = await getGroupMessages(req.params.groupId, req.user.id);
  if (!result) {
    return res.status(404).json({ error: 'Group not found' });
  }

  res.json({
    data: result.messages,
    meta: {
      group: result.group,
      aiPending: isGroupAiPending(req.params.groupId),
    },
  });
}

export async function sendGroupMessage(req, res) {
  const { groupId, content } = req.body;
  const userId = req.user.id;

  if (!groupId || !content?.trim()) {
    throw validationError('groupId and content are required');
  }

  await requireContentModeration({ userId, text: content });

  const client = await pool.connect();
  let energyResult;
  let insertResult;

  try {
    await client.query('BEGIN');
    energyResult = await spendEnergy(userId, 'dm', client);
    insertResult = await insertGroupMessage({ groupId, userId, content: content.trim() });
    if (!insertResult) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  queueGroupAiReplies({
    user: req.user,
    groupId,
    content: content.trim(),
    mentionedCharacters: insertResult.mentionedCharacters,
    userMessage: insertResult.message,
  });

  await logEvent({
    userId,
    eventType: 'group_message_sent',
    metadata: { groupId, mentions: insertResult.mentionedCharacters.map((c) => c.handle) },
  });

  res.status(201).json({
    data: insertResult.message,
    groupId,
    energy: energyResult.state,
    spent: energyResult.spent,
    costs: ENERGY_COSTS,
    aiPending: insertResult.mentionedCharacters.length > 0,
    mentioned: insertResult.mentionedCharacters.map((c) => ({
      id: c.id,
      handle: c.handle,
      name: c.name,
    })),
  });
}

export async function joinGroupRoom(req, res) {
  const memberIds = await getGroupMemberUserIds(req.params.groupId);
  if (!memberIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a group member' });
  }
  res.json({ data: { groupId: req.params.groupId, joined: true } });
}
