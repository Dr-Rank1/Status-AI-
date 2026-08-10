import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { aiRateLimiter } from '../middleware/rateLimit.js';
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
import * as voice from '../controllers/voiceController.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'status-api' });
});

// Auth (public)
router.post('/auth/register', asyncHandler(auth.register));
router.post('/auth/login', asyncHandler(auth.login));

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

router.post('/posts', asyncHandler(posts.createPost));

// AI-triggering routes (rate limited)
router.post('/posts/:id/replies', aiRateLimiter, asyncHandler(posts.replyToPost));
router.post('/messages', aiRateLimiter, asyncHandler(messages.sendMessage));

router.get('/messages/threads', asyncHandler(messages.listThreads));
router.get('/messages/threads/:threadId', asyncHandler(messages.getThreadMessages));
router.post('/messages/threads/character/:characterId', asyncHandler(messages.getOrCreateThread));

router.get('/messages/groups', asyncHandler(groups.listGroups));
router.post('/messages/groups', asyncHandler(groups.createGroupThread));
router.get('/messages/groups/:groupId', asyncHandler(groups.getMessages));
router.post('/messages/groups/send', aiRateLimiter, asyncHandler(groups.sendGroupMessage));

router.get('/energy', asyncHandler(energy.getMyEnergyState));
router.post('/energy/refill', asyncHandler(energy.refillEnergy));

router.post('/analytics/events', asyncHandler(analytics.ingestClientEvents));

// Admin routes
router.get('/admin/characters', adminMiddleware, asyncHandler(admin.listAllCharacters));
router.post('/admin/characters', adminMiddleware, asyncHandler(admin.upsertCharacter));

export default router;
