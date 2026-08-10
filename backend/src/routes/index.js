import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { uploadImage as multerUpload } from '../config/upload.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/usersController.js';
import * as characters from '../controllers/charactersController.js';
import * as posts from '../controllers/postsController.js';
import * as messages from '../controllers/messagesController.js';
import * as energy from '../controllers/energyController.js';
import * as profile from '../controllers/profileController.js';
import * as upload from '../controllers/uploadController.js';

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

router.get('/characters/explore', asyncHandler(characters.exploreCharacters));
router.get('/characters/:id', asyncHandler(characters.getCharacter));
router.post('/characters/:id/follow', asyncHandler(characters.follow));
router.delete('/characters/:id/follow', asyncHandler(characters.unfollow));

router.post('/posts', asyncHandler(posts.createPost));
router.post('/posts/:id/replies', asyncHandler(posts.replyToPost));

router.get('/messages/threads', asyncHandler(messages.listThreads));
router.get('/messages/threads/:threadId', asyncHandler(messages.getThreadMessages));
router.post('/messages/threads/character/:characterId', asyncHandler(messages.getOrCreateThread));
router.post('/messages', asyncHandler(messages.sendMessage));

router.get('/energy', asyncHandler(energy.getMyEnergyState));
router.post('/energy/refill', asyncHandler(energy.refillEnergy));

export default router;
