import { clearAuth, getToken } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE as string;

export class ApiError extends Error {
  status: number;
  bodyText: string;
  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

function maybeRedirectAuth(status: number) {
  if (status === 401 || status === 403) {
    clearAuth();
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }
}

function extractMessage(bodyText: string): string {
  const trimmed = (bodyText || '').trim();
  if (!trimmed) return '';
  try {
    const j = JSON.parse(trimmed);
    if (typeof j === 'string') return j;
    if (j?.error && typeof j.error === 'string') return j.error;
    if (j?.message && typeof j.message === 'string') return j.message;
    return trimmed;
  } catch {
    return trimmed;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    ...(init.headers as any)
  };

  // Set JSON content-type only when sending JSON
  const hasBody = typeof init.body === 'string';
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    maybeRedirectAuth(res.status);
    const msg = extractMessage(bodyText) || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, bodyText);
  }

  // 204 / empty
  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // fallback
    return (await res.text()) as unknown as T;
  }
  return res.json();
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: any }>(`/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}
