import { registerUser, loginUser } from '../services/authService.js';
import { getSessionPayload } from '../services/sessionService.js';

export async function register(req, res) {
  const { username, email, password, displayName } = req.body;
  const result = await registerUser({
    username,
    email,
    password,
    displayName,
    tenantId: req.tenantId,
  });

  const session = await getSessionPayload(result.user.id);

  res.status(201).json({
    data: {
      user: result.user,
      token: result.token,
      pqSignature: result.pqSignature ?? null,
      pqAlgorithm: result.pqAlgorithm ?? null,
      energy: session?.energy ?? null,
    },
  });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const result = await loginUser({ email, password, tenantId: req.tenantId });

  const session = await getSessionPayload(result.user.id);

  res.json({
    data: {
      user: result.user,
      token: result.token,
      pqSignature: result.pqSignature ?? null,
      pqAlgorithm: result.pqAlgorithm ?? null,
      energy: session?.energy ?? null,
    },
  });
}

export async function me(req, res) {
  const payload = await getSessionPayload(req.user.id);
  res.json({ data: payload });
}
