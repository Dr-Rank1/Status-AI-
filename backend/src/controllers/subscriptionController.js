import {
  processRevenueCatWebhook,
  verifyRevenueCatWebhook,
  syncEntitlementsFromClient,
} from '../services/revenueCatService.js';
import { getUserEntitlements } from '../services/subscriptionService.js';
import { AppError } from '../utils/errors.js';

export async function handleWebhook(req, res) {
  if (!verifyRevenueCatWebhook(req)) {
    throw new AppError('Invalid RevenueCat webhook signature', 401, 'UNAUTHORIZED');
  }

  const result = await processRevenueCatWebhook(req.body);
  res.json({ data: result });
}

export async function getMyEntitlements(req, res) {
  const entitlements = await getUserEntitlements(req.user.id);
  res.json({ data: entitlements });
}

export async function syncFromClient(req, res) {
  const { appUserId, activeEntitlements } = req.body;
  const result = await syncEntitlementsFromClient({
    userId: req.user.id,
    appUserId: appUserId ?? req.user.id,
    activeEntitlements: activeEntitlements ?? [],
  });
  res.json({ data: result });
}
