"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { apiFetch } from "../lib/api";

export type UserRole = "PATIENT" | "DOCTOR" | "RELATIVE";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  supervisorPhone?: string | null;
  avatarUrl?: string | null;
  birthDate?: string | null;
  age?: number | null;
  bio?: string | null;
  role: UserRole;
  firstLogin: boolean;
  language: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (
    name: string,
    email: string,
    password: string,
    birthDate: string,
    role?: UserRole,
    supervisorPhone?: string,
    linkedCode?: string
  ) => Promise<AuthUser>;
  logout: () => void;
  setUser: (next: AuthUser | null) => void;
  forgotPassword: (email: string) => Promise<{ ok: boolean; resetToken?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ ok: boolean }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("bb-user-changed"));
    }
  }, []);

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("bb_user") : null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AuthUser;
          if (!parsed.role) parsed.role = "PATIENT";
          setUser(parsed);
        } catch {
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem("bb_token", data.token);
    localStorage.setItem("bb_user", JSON.stringify(data.user));
    if (data.user.language === "fr" || data.user.language === "ar" || data.user.language === "en") {
      localStorage.setItem("bb_lang", data.user.language);
    }
    setUser(data.user);
    return data.user;
  }, [setUser]);

  const signup = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      birthDate: string,
      role: UserRole = "PATIENT",
      supervisorPhone?: string,
      linkedCode?: string
    ) => {
      const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, birthDate, role, supervisorPhone: supervisorPhone || undefined, linkedCode: linkedCode || undefined })
      });
      localStorage.setItem("bb_token", data.token);
      localStorage.setItem("bb_user", JSON.stringify(data.user));
      if (data.user.language === "fr" || data.user.language === "ar" || data.user.language === "en") {
        localStorage.setItem("bb_lang", data.user.language);
      }
      setUser(data.user);
      return data.user;
    },
    [setUser]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("bb_token");
    localStorage.removeItem("bb_user");
    setUserState(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("bb-user-changed"));
      window.location.assign("/");
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return apiFetch<{ ok: boolean; resetToken?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    return apiFetch<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password })
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      setUser,
      forgotPassword,
      resetPassword
    }),
    [user, loading, login, signup, logout, setUser, forgotPassword, resetPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
