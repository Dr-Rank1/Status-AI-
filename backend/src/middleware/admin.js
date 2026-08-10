import { AppError } from '../utils/errors.js';

export function adminMiddleware(req, _res, next) {
  if (!req.user?.is_admin) {
    return next(new AppError('Admin access required', 403, 'FORBIDDEN'));
  }
  next();
}
