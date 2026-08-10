import { verifyToken, getUserById } from '../services/authService.js';
import { extractPQCredentials, logPQHandshakeFailure } from '../services/postQuantumAuthService.js';
import { recordPQHandshakeFailure } from '../services/aiAnomalyDetectionService.js';
import { AppError } from '../utils/errors.js';

export async function authMiddleware(req, res, next) {
  try {
    const { token, pqSignature } = extractPQCredentials(req);

    if (!token) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = verifyToken(token, pqSignature);
    } catch (err) {
      if (err.code === 'PQ_AUTH_FAILED') {
        logPQHandshakeFailure(err.message);
        await recordPQHandshakeFailure({ path: req.path, ip: req.ip });
        return next(new AppError('Post-quantum authentication failed', 401, 'PQ_AUTH_FAILED'));
      }
      throw err;
    }

    const user = await getUserById(payload.userId, payload.tenantId ?? req.tenantId);
    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    if (payload.tenantId && req.tenantId && payload.tenantId !== req.tenantId) {
      throw new AppError('Token tenant mismatch', 403, 'TENANT_FORBIDDEN');
    }

    req.user = user;
    req.token = token;
    req.pqSignature = pqSignature;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
    }
    next(err);
  }
}
