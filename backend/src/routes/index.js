import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { aiRateLimiter, authRateLimiter, paymentRateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  sendMessageSchema,
  createPostSchema,
  refillEnergySchema,
  replyToPostSchema,
  feedbackSchema,
  e2eeRegisterKeySchema,
  storagePinUrlSchema,
  storagePinCharacterSchema,
  zkpVerifySchema,
  federatedSubmitSchema,
  devClientRegisterSchema,
  pqRegisterKeySchema,
  bciIntentSchema,
  syntheticBatchSchema,
  affectiveMetricsSchema,
  meshRegisterSchema,
  meshSignalSchema,
  meshGossipSchema,
  metaverseSyncSchema,
  tenantThemeSchema,
  tenantAiConfigSchema,
  tenantProvisionSchema,
  subscriptionSyncSchema,
} from '../validation/schemas.js';
import { uploadImage as multerUpload, uploadAudio as multerAudio } from '../config/upload.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/usersController.js';
import * as characters from '../controllers/charactersController.js';
import * as posts from '../controllers/postsController.js';
import * as messages from '../controllers/messagesController.js';
import * as energy from '../controllers/energyController.js';
import * as profile from '../controllers/profileController.js';
import * as upload from '../controllers/uploadController.js';
import * as admin from '../controllers/adminController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as groups from '../controllers/groupsController.js';
import * as live from '../controllers/liveStreamController.js';
import * as voice from '../controllers/voiceController.js';
import * as spatial from '../controllers/spatialController.js';
import * as feedback from '../controllers/feedbackController.js';
import * as e2ee from '../controllers/e2eeController.js';
import * as agentWallet from '../controllers/agentWalletController.js';
import * as storage from '../controllers/storageController.js';
import * as zkp from '../controllers/zkpController.js';
import * as oauth from '../controllers/oauthController.js';
import * as compliance from '../controllers/complianceController.js';
import * as pqCrypto from '../controllers/pqCryptoController.js';
import * as selfHealing from '../controllers/selfHealingController.js';
import * as synthetic from '../controllers/syntheticController.js';
import * as bci from '../controllers/bciController.js';
import * as affective from '../controllers/affectiveController.js';
import * as mesh from '../controllers/meshController.js';
import * as metaverse from '../controllers/metaverseController.js';
import * as tenantAdmin from '../controllers/tenantAdminController.js';
import * as subscription from '../controllers/subscriptionController.js';
import wearableRouter from './wearable.js';
import { spatialPrivacyMiddleware } from '../middleware/spatialPrivacy.js';
import { bciPrivacyMiddleware } from '../middleware/bciPrivacy.js';
import { affectivePrivacyMiddleware } from '../middleware/affectivePrivacy.js';
import { live, ready } from '../controllers/healthController.js';
import { regionStatus } from '../middleware/region.js';

const router = Router();

router.get('/health', live);
router.get('/health/live', live);
router.get('/health/ready', asyncHandler(ready));
router.get('/health/region', asyncHandler(regionStatus));

// Auth (public) — rate limited + validated
router.post('/auth/register', authRateLimiter, validateBody(registerSchema), asyncHandler(auth.register));
router.post('/auth/login', authRateLimiter, validateBody(loginSchema), asyncHandler(auth.login));

// Public read routes
router.get('/users', asyncHandler(users.listUsers));
router.get('/users/:id', asyncHandler(users.getUser));

router.get('/characters', asyncHandler(characters.listCharacters));
router.get('/posts', asyncHandler(posts.listPosts));
router.get('/posts/:id', asyncHandler(posts.getPost));
router.get('/posts/:id/replies', asyncHandler(posts.getPostReplies));

router.get('/store/products', asyncHandler(energy.listStoreProducts));

router.get('/tenant/theme', asyncHandler(tenantAdmin.getPublicTheme));
router.get('/tenant/config', asyncHandler(tenantAdmin.getTenantConfig));

router.post('/webhooks/revenuecat', asyncHandler(subscription.handleWebhook));

router.post('/zkp/verify', validateBody(zkpVerifySchema), asyncHandler(zkp.verifyProof));

// Protected routes (JWT)
router.use(authMiddleware);
router.use(validateUserTenantMiddleware);

router.get('/auth/me', asyncHandler(auth.me));
router.get('/session', asyncHandler(auth.me));

router.get('/profile', asyncHandler(profile.getProfile));
router.get('/profile/activity', asyncHandler(profile.getProfileActivity));
router.patch('/profile', asyncHandler(profile.updateProfile));

router.post('/uploads/image', multerUpload.single('image'), asyncHandler(upload.uploadImage));

router.post('/voice/transcribe', multerAudio.single('audio'), asyncHandler(voice.transcribe));
router.post('/voice/synthesize', asyncHandler(voice.synthesize));

router.get('/characters/explore', asyncHandler(characters.exploreCharacters));
router.post('/characters', asyncHandler(characters.createCharacter));
router.get('/characters/mine', asyncHandler(characters.listMyCharacters));
router.get('/characters/:id', asyncHandler(characters.getCharacter));
router.post('/characters/:id/follow', asyncHandler(characters.follow));
router.delete('/characters/:id/follow', asyncHandler(characters.unfollow));

router.post('/posts', validateBody(createPostSchema), asyncHandler(posts.createPost));

// AI-triggering routes (rate limited + validated)
router.post('/posts/:id/replies', aiRateLimiter, validateBody(replyToPostSchema), asyncHandler(posts.replyToPost));
router.post('/messages', aiRateLimiter, validateBody(sendMessageSchema), asyncHandler(messages.sendMessage));

router.get('/messages/threads', asyncHandler(messages.listThreads));
router.get('/messages/threads/:threadId', asyncHandler(messages.getThreadMessages));
router.post('/messages/threads/character/:characterId', asyncHandler(messages.getOrCreateThread));

router.get('/messages/groups', asyncHandler(groups.listGroups));
router.post('/messages/groups', asyncHandler(groups.createGroupThread));
router.get('/messages/groups/:groupId', asyncHandler(groups.getMessages));
router.post('/messages/groups/send', aiRateLimiter, asyncHandler(groups.sendGroupMessage));

router.get('/energy', asyncHandler(energy.getMyEnergyState));
router.post('/energy/refill', paymentRateLimiter, validateBody(refillEnergySchema), asyncHandler(energy.refillEnergy));

router.get('/subscription/entitlements', asyncHandler(subscription.getMyEntitlements));
router.post('/subscription/sync', validateBody(subscriptionSyncSchema), asyncHandler(subscription.syncFromClient));

router.post('/analytics/events', asyncHandler(analytics.ingestClientEvents));

router.post('/feedback', validateBody(feedbackSchema), asyncHandler(feedback.submitFeedback));

router.post('/developers/clients', validateBody(devClientRegisterSchema), asyncHandler(oauth.registerDevClient));

router.post('/e2ee/keys', validateBody(e2eeRegisterKeySchema), asyncHandler(e2ee.registerKey));
router.get('/e2ee/keys', asyncHandler(e2ee.getKeys));

router.get('/characters/:characterId/wallet', asyncHandler(agentWallet.getCharacterWallet));
router.get('/wallets/agents', asyncHandler(agentWallet.listWallets));

router.post('/storage/pin', multerUpload.single('file'), asyncHandler(storage.pinUpload));
router.post('/storage/pin-url', validateBody(storagePinUrlSchema), asyncHandler(storage.pinRemoteUrl));
router.post(
  '/storage/characters/:characterId/pin',
  multerUpload.single('file'),
  asyncHandler(storage.pinCharacter),
);
router.post('/storage/posts/:postId/pin', multerUpload.single('file'), asyncHandler(storage.pinPost));
router.get('/storage/resolve', asyncHandler(storage.resolveMedia));

router.post('/zkp/proof', asyncHandler(zkp.generateProof));

router.use('/wearable', wearableRouter);

router.get('/live/sessions', asyncHandler(live.listSessions));
router.post('/live/sessions', asyncHandler(live.createSession));
router.get('/live/sessions/:sessionId', asyncHandler(live.getSession));
router.post('/live/sessions/:sessionId/chat', asyncHandler(live.sendChat));
router.post('/live/sessions/:sessionId/super-chat', asyncHandler(live.sendSuperChat));
router.delete('/live/sessions/:sessionId', asyncHandler(live.endSession));

router.use(spatialPrivacyMiddleware);

router.get('/spatial/scenes', asyncHandler(spatial.listScenes));
router.get('/spatial/scenes/:sceneKey', asyncHandler(spatial.getScene));
router.post('/spatial/scenes', asyncHandler(spatial.saveScene));
router.delete('/spatial/scenes/:sceneKey', asyncHandler(spatial.deleteScene));
router.post('/spatial/context', asyncHandler(spatial.submitContext));
router.post('/spatial/react', aiRateLimiter, asyncHandler(spatial.spatialCharacterReact));

router.get('/compliance/audit', adminMiddleware, asyncHandler(compliance.exportComplianceAudit));
router.get('/compliance/status', adminMiddleware, asyncHandler(compliance.complianceStatus));

router.post('/pq/keys', validateBody(pqRegisterKeySchema), asyncHandler(pqCrypto.registerPQKey));

router.post('/bci/intent', bciPrivacyMiddleware, validateBody(bciIntentSchema), asyncHandler(bci.submitIntent));
router.get('/bci/events', asyncHandler(bci.recentEvents));

router.post('/affective/metrics', affectivePrivacyMiddleware, validateBody(affectiveMetricsSchema), asyncHandler(affective.submitAffectiveMetrics));
router.get('/affective/context', asyncHandler(affective.getAffectiveContext));

router.post('/mesh/register', validateBody(meshRegisterSchema), asyncHandler(mesh.registerPeer));
router.get('/mesh/peers/:clusterId', asyncHandler(mesh.listPeers));
router.post('/mesh/signal', validateBody(meshSignalSchema), asyncHandler(mesh.signal));
router.post('/mesh/gossip', validateBody(meshGossipSchema), asyncHandler(mesh.gossip));
router.get('/mesh/status', asyncHandler(mesh.status));

router.post('/metaverse/sync', validateBody(metaverseSyncSchema), asyncHandler(metaverse.createSync));
router.get('/metaverse/sync/:token', asyncHandler(metaverse.getSync));
router.get('/metaverse/export/:characterId', asyncHandler(metaverse.exportCharacter));

router.patch('/tenant/theme', adminMiddleware, validateBody(tenantThemeSchema), asyncHandler(tenantAdmin.updateTheme));
router.patch('/tenant/ai-config', adminMiddleware, validateBody(tenantAiConfigSchema), asyncHandler(tenantAdmin.updateAiConfig));
router.get('/tenant/admin/users', adminMiddleware, asyncHandler(tenantAdmin.listUsersForModeration));
router.post('/tenant/admin/users/:userId/moderate', adminMiddleware, asyncHandler(tenantAdmin.moderateUser));
router.get('/tenant/admin/characters', adminMiddleware, asyncHandler(tenantAdmin.listCharactersForTuning));
router.patch('/tenant/admin/characters/:characterId/prompt', adminMiddleware, asyncHandler(tenantAdmin.tuneCharacterPrompt));
router.post('/tenant/provision', adminMiddleware, validateBody(tenantProvisionSchema), asyncHandler(tenantAdmin.createTenant));
router.get('/tenant/list', adminMiddleware, asyncHandler(tenantAdmin.listAllTenants));

router.get('/admin/self-healing/status', adminMiddleware, asyncHandler(selfHealing.status));
router.get('/admin/self-healing/errors', adminMiddleware, asyncHandler(selfHealing.recentErrors));
router.post('/admin/self-healing/inspect', adminMiddleware, asyncHandler(selfHealing.inspect));
router.post('/admin/self-healing/cycle', adminMiddleware, asyncHandler(selfHealing.runCycle));
router.post('/admin/self-healing/patches/:patchId/apply', adminMiddleware, asyncHandler(selfHealing.hotApplyPatch));

router.get('/admin/synthetic/status', adminMiddleware, asyncHandler(synthetic.status));
router.post('/admin/synthetic/run', adminMiddleware, validateBody(syntheticBatchSchema), asyncHandler(synthetic.startBatch));
router.post('/admin/synthetic/worker', adminMiddleware, asyncHandler(synthetic.runWorker));
router.get('/admin/synthetic/curated', adminMiddleware, asyncHandler(synthetic.exportCurated));

// Admin routes
router.get('/admin/characters', adminMiddleware, asyncHandler(admin.listAllCharacters));
router.post('/admin/characters', adminMiddleware, asyncHandler(admin.upsertCharacter));

export default router;
