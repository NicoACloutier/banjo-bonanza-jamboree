/**
 * Global authentication context. Tracks the current logged-in user (if
 * any) and exposes login/register/logout actions. Anonymous browsing is a
 * first-class supported state: `user` is simply `null`.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AuthApi } from "../lib/api";
import { clearTokens, getAccessToken, storeTokens } from "../lib/apiClient";
import type { UserPublic } from "../types/api";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await AuthApi.me();
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCurrentUser();
  }, [refreshCurrentUser]);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await AuthApi.login(username, password);
    storeTokens(tokens);
    await refreshCurrentUser();
  }, [refreshCurrentUser]);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const tokens = await AuthApi.register(username, email, password);
      storeTokens(tokens);
      await refreshCurrentUser();
    },
    [refreshCurrentUser],
  );

  const loginWithGoogle = useCallback(
    async (code: string) => {
      const tokens = await AuthApi.google(code);
      storeTokens(tokens);
      await refreshCurrentUser();
    },
    [refreshCurrentUser],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
