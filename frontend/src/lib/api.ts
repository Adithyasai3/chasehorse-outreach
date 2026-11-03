/* Thin client for the ChaseHorse API (same-origin, proxied to Express). */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public provider?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0, 'NETWORK');
  }
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
    throw new ApiError('Session expired', 401, 'UNAUTHENTICATED');
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json.error || {};
    throw new ApiError(e.message || `Request failed (${res.status})`, res.status, e.code || 'ERROR', e.provider, e.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION' && Array.isArray(err.details) && err.details.length) {
      const first = err.details[0] as { path?: string; message?: string };
      return first.path ? `${first.path}: ${first.message}` : err.message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
