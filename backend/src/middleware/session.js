import { resolveSessionUser } from '../services/sessionService.js';
import { AppError } from '../utils/errors.js';

export async function sessionMiddleware(req, res, next) {
  try {
    const user = await resolveSessionUser(req);
    if (!user) {
      throw new AppError('No active session user configured', 503, 'SESSION_UNAVAILABLE');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalSessionMiddleware(req, _res, next) {
  resolveSessionUser(req)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(next);
}
