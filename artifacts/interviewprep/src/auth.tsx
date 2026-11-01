import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type User = { id: number; email: string };
export const messages = {
  blank: 'Please fill in all fields.',
  mismatch: "Passwords don't match.",
  short: 'Password must be at least 8 characters.',
  special: 'Password must include at least one special character (for example, !, @, or #).',
  email: 'Please enter a valid email address.',
};
let csrfToken = '';
export async function authRequest(path: string, body?: object) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data as { user: User | null; csrfToken?: string };
}
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  authenticate: (mode: 'signup' | 'login', body: object) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try { setUser((await authRequest('status')).user); }
    catch { setUser(null); setError('Unable to check your session. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [refresh]);
  const authenticate = async (mode: 'signup' | 'login', body: object) => {
    setUser((await authRequest(mode, body)).user);
  };
  const logout = async () => { await authRequest('logout', {}); setUser(null); await refresh(); };
  return <AuthContext.Provider value={{ user, loading, error, refresh, authenticate, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required.');
  return context;
}
