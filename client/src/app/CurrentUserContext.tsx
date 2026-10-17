import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { setApiUserId } from '@/lib/api';
import type { Role, User } from '@/types/domain';

// sessionStorage (not localStorage): each browser tab keeps its own user, needed for the MUTEX demo.
const STORAGE_KEY = 'tree-monitor:user';

interface CurrentUserContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

function readStoredUser(): User | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = readStoredUser();
    setApiUserId(stored?.id ?? null);
    return stored;
  });

  const login = useCallback((next: User) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setApiUserId(next.id);
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setApiUserId(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  return context;
}

export function homePathForRole(role: Role): string {
  return role === 'official' ? '/official' : '/contractor';
}
