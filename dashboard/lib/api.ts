const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'default';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Tenant-Slug': TENANT_SLUG,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `API error ${res.status}`);
  }

  const body = await res.json();
  return body.data as T;
}

export { API_BASE, TENANT_SLUG };
