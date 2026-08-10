import { registerPQDeviceKey } from '../services/postQuantumAuthService.js';
import { validationError } from '../utils/errors.js';

export async function registerPQKey(req, res) {
  const { deviceId, kyberPublicKey, algorithm } = req.body;

  if (!deviceId?.trim() || !kyberPublicKey?.trim()) {
    throw validationError('deviceId and kyberPublicKey are required');
  }

  const data = await registerPQDeviceKey({
    userId: req.user.id,
    deviceId: deviceId.trim(),
    kyberPublicKey: kyberPublicKey.trim(),
    algorithm: algorithm ?? 'kyber768',
  });

  res.status(201).json({ data });
}
