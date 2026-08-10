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
import { spatialPrivacyMiddleware } from '../middleware/spatialPrivacy.js';
import { live, ready } from '../controllers/healthController.js';

const router = Router();

router.get('/health', live);
router.get('/health/live', live);
router.get('/health/ready', asyncHandler(ready));

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

// Protected routes (JWT)
router.use(authMiddleware);

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

router.post('/analytics/events', asyncHandler(analytics.ingestClientEvents));

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

// Admin routes
router.get('/admin/characters', adminMiddleware, asyncHandler(admin.listAllCharacters));
router.post('/admin/characters', adminMiddleware, asyncHandler(admin.upsertCharacter));

export default router;
