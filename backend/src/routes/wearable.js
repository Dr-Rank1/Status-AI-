import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { zkpVerifySchema } from '../validation/schemas.js';
import * as wearable from '../controllers/wearableController.js';

const router = Router();

router.use(authMiddleware);

router.get('/sync', asyncHandler(wearable.getSyncPayload));
router.post('/events', asyncHandler(wearable.ingestWearableEvent));

export default router;
