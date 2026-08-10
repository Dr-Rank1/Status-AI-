import { validateAccessToken, tokenHasScope } from '../services/oauthService.js';

export async function oauthMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  const client = await validateAccessToken(token);
  if (!client) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Valid OAuth2 bearer token required',
    });
  }

  req.oauthClient = client;
  next();
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (!tokenHasScope(req.oauthClient, scope)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Scope "${scope}" required`,
      });
    }
    next();
  };
}
