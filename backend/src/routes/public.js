import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { oauthMiddleware, requireScope } from '../middleware/oauthPublic.js';
import { publicApiRateLimiter, oauthTokenRateLimiter } from '../middleware/publicRateLimit.js';
import {
  oauthTokenSchema,
  publicChatSchema,
  webhookRegisterSchema,
  federatedSubmitSchema,
} from '../validation/schemas.js';
import * as oauth from '../controllers/oauthController.js';
import * as publicApi from '../controllers/publicApiController.js';
import * as webhooks from '../controllers/webhookController.js';
import * as federated from '../controllers/federatedController.js';

const router = Router();

// OAuth2 token endpoint (unauthenticated)
router.post('/oauth/token', oauthTokenRateLimiter, validateBody(oauthTokenSchema), asyncHandler(oauth.token));

// Federated learning (device sync — user JWT via parent router OR public with commitment)
router.get('/federated/status', asyncHandler(federated.status));
router.get('/federated/weights', asyncHandler(federated.latestWeights));
router.post('/federated/submit', validateBody(federatedSubmitSchema), asyncHandler(federated.submit));

// OAuth-protected public developer API
router.use(oauthMiddleware);
router.use(publicApiRateLimiter);

router.get('/feed', requireScope('feed:read'), asyncHandler(publicApi.publicFeed));
router.get('/characters', requireScope('characters:read'), asyncHandler(publicApi.publicCharacters));
router.get('/characters/:id', requireScope('characters:read'), asyncHandler(publicApi.publicCharacter));
router.post(
  '/characters/:id/chat',
  requireScope('characters:chat'),
  validateBody(publicChatSchema),
  asyncHandler(publicApi.publicCharacterChat),
);

router.get('/webhooks', requireScope('webhooks:manage'), asyncHandler(webhooks.getWebhooks));
router.post(
  '/webhooks',
  requireScope('webhooks:manage'),
  validateBody(webhookRegisterSchema),
  asyncHandler(webhooks.createWebhook),
);
router.delete('/webhooks/:id', requireScope('webhooks:manage'), asyncHandler(webhooks.removeWebhook));

export default router;
