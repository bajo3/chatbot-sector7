export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getUser(): AuthedUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || typeof u !== 'object') return null;
    const id = (u as any).id;
    const name = (u as any).name;
    const email = (u as any).email;
    const role = (u as any).role;
    if (typeof id !== 'string' || !id) return null;
    return {
      id,
      name: String(name || ''),
      email: String(email || ''),
      role: String(role || '')
    };
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthedUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthed(): boolean {
  return !!getToken();
}
