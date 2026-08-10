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

const API_V2_BASE =
  process.env.NEXT_PUBLIC_API_V2_BASE_URL
  ?? API_BASE.replace(/\/api\/v1\/?$/, '/api/v2');

export async function apiFetchV2<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${API_V2_BASE}${path}`, {
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
    throw new Error(err.message ?? err.error?.message ?? `API error ${res.status}`);
  }

  const body = await res.json();
  return body.data as T;
}

export { API_BASE, API_V2_BASE, TENANT_SLUG };
