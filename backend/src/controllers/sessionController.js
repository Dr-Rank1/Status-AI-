import { getSessionPayload } from '../services/sessionService.js';

export async function getSession(req, res) {
  const payload = await getSessionPayload(req.user.id);
  res.json({ data: payload });
}
