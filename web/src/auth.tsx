// Autentifikatsiya konteksti va rolga asoslangan ruxsatlar.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken, LOCAL_MODE, type Role, type User } from './api';

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: Perm) => boolean;
};

export type Perm = 'refs' | 'waybills' | 'fuel' | 'admin';

const PERMS: Record<Role, Perm[]> = {
  admin: ['refs', 'waybills', 'fuel', 'admin'],
  dispatcher: ['waybills', 'fuel'],
  operator: ['fuel'],
  viewer: [],
};

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Demo rejimida parol so'ralmaydi — baza brauzerda ochiladi va darhol ishga tushadi
    if (LOCAL_MODE) {
      api.get<{ user: User }>('/auth/me')
        .then((r) => setUser(r.user))
        .catch(() => {})
        .finally(() => setReady(true));
      return;
    }
    if (!getToken()) { setReady(true); return; }
    api.get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  const login = async (username: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    setToken(r.token);
    setUser(r.user);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* sessiya allaqachon yopilgan bo'lishi mumkin */ }
    clearToken();
    setUser(null);
  };

  const can = (perm: Perm) => !!user && PERMS[user.role].includes(perm);

  return <Ctx.Provider value={{ user, ready, login, logout, can }}>{children}</Ctx.Provider>;
}
