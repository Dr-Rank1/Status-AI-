import {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  ALLOWED_EVENTS,
} from '../services/webhookService.js';
import { validationError } from '../utils/errors.js';
import crypto from 'crypto';

export async function createWebhook(req, res) {
  const { url, events, secret } = req.body;

  if (!url?.trim()) {
    throw validationError('url is required');
  }

  const webhookSecret = secret?.trim() || crypto.randomBytes(24).toString('base64url');

  const data = await registerWebhook({
    clientId: req.oauthClient.client_id,
    url: url.trim(),
    secret: webhookSecret,
    events,
  });

  res.status(201).json({
    data: { ...data, secret: webhookSecret },
    allowedEvents: [...ALLOWED_EVENTS],
  });
}

export async function getWebhooks(req, res) {
  const data = await listWebhooks(req.oauthClient.client_id);
  res.json({ data });
}

export async function removeWebhook(req, res) {
  const removed = await deleteWebhook({
    clientId: req.oauthClient.client_id,
    webhookId: req.params.id,
  });

  if (!removed) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.status(204).send();
}
