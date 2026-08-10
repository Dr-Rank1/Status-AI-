import {
  submitContribution,
  getFederatedStatus,
  getLatestGlobalWeights,
  aggregateRound,
} from '../services/federatedLearningService.js';
import { validationError } from '../utils/errors.js';

export async function status(req, res) {
  const data = await getFederatedStatus();
  res.json({ data });
}

export async function latestWeights(req, res) {
  const data = await getLatestGlobalWeights();
  res.json({ data });
}

export async function submit(req, res) {
  const { userCommitment, encryptedPayload, sampleCount } = req.body;

  if (!userCommitment || !encryptedPayload) {
    throw validationError('userCommitment and encryptedPayload are required');
  }

  const data = await submitContribution({ userCommitment, encryptedPayload, sampleCount });
  res.status(202).json({ data });
}

export async function aggregate(req, res) {
  const { roundId } = req.body;
  if (!roundId) {
    throw validationError('roundId is required');
  }

  const data = await aggregateRound(roundId);
  res.json({ data });
}
