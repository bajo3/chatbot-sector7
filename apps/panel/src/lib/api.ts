const API_BASE = import.meta.env.VITE_API_BASE as string;

export function getToken() {
  return localStorage.getItem('token') || '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(email: string, password: string) {
  return api<{token:string; user:any}>(`/auth/login`, {
    method:'POST',
    body: JSON.stringify({ email, password })
  });
}
