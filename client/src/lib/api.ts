const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

let currentUserId: string | null = null;

/** Called by CurrentUserProvider; every request then carries x-user-id. */
export function setApiUserId(userId: string | null) {
  currentUserId = userId;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (currentUserId) headers.set('x-user-id', currentUserId);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Błąd HTTP ${response.status}`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<UploadResult>('/api/uploads', { method: 'POST', body: form });
  },
};

export interface UploadResult {
  url: string;
  original_name: string;
  size: number;
  mime_type: string;
}

/** Turns server-relative paths (/uploads/..., /demo/...) into URLs usable in <img>/<a>. */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return path.startsWith('/uploads/') ? `${API_BASE}${path}` : path;
}
