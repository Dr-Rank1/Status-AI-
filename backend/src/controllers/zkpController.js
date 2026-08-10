import {
  generateProofBundle,
  verifyProofWithNullifierCheck,
} from '../services/zkpVerificationService.js';
import { validationError } from '../utils/errors.js';

export async function generateProof(req, res) {
  const data = await generateProofBundle(req.user.id);
  res.json({ data });
}

export async function verifyProof(req, res) {
  const { proof, claimType, threshold } = req.body;

  if (!proof?.trim()) {
    throw validationError('proof is required');
  }
  if (!claimType) {
    throw validationError('claimType is required');
  }

  const requiredClaim = buildRequiredClaim(claimType, threshold);
  const result = await verifyProofWithNullifierCheck(proof.trim(), requiredClaim);

  res.json({ data: result });
}

function buildRequiredClaim(claimType, threshold) {
  switch (claimType) {
    case 'reputation_min':
      return { type: 'reputation_min', threshold: parseInt(threshold ?? '0', 10) };
    case 'account_age_days':
      return { type: 'account_age_days', threshold: parseInt(threshold ?? '0', 10) };
    case 'vip':
      return { type: 'vip' };
    default:
      throw validationError(`Unknown claimType: ${claimType}`);
  }
}
