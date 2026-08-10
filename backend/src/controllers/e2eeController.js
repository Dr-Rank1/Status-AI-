import { registerDeviceKey, listDeviceKeys } from '../services/e2eeService.js';
import { validationError } from '../utils/errors.js';

export async function registerKey(req, res) {
  const { deviceId, identityKeyPublic, signedPrekeyPublic } = req.body;

  if (!deviceId?.trim() || !identityKeyPublic?.trim()) {
    throw validationError('deviceId and identityKeyPublic are required');
  }

  const data = await registerDeviceKey({
    userId: req.user.id,
    deviceId: deviceId.trim(),
    identityKeyPublic: identityKeyPublic.trim(),
    signedPrekeyPublic: signedPrekeyPublic?.trim(),
  });

  res.status(201).json({ data });
}

export async function getKeys(req, res) {
  const data = await listDeviceKeys(req.user.id);
  res.json({ data });
}
