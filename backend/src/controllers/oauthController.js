import { issueToken, registerClient } from '../services/oauthService.js';
import { validationError } from '../utils/errors.js';

export async function token(req, res) {
  const { grant_type, client_id, client_secret } = req.body;

  if (grant_type !== 'client_credentials') {
    throw validationError('Only grant_type=client_credentials is supported');
  }
  if (!client_id || !client_secret) {
    throw validationError('client_id and client_secret are required');
  }

  const data = await issueToken({ clientId: client_id, clientSecret: client_secret });
  res.json(data);
}

export async function registerDevClient(req, res) {
  const { name, scopes } = req.body;
  if (!name?.trim()) {
    throw validationError('name is required');
  }

  const data = await registerClient({
    name: name.trim(),
    ownerUserId: req.user?.id,
    scopes: scopes ?? ['feed:read', 'characters:read'],
  });

  res.status(201).json({
    data,
    warning: 'Store clientSecret securely — it will not be shown again.',
  });
}
