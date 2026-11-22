"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  refreshSession,
  setAccessToken,
  type Profile,
  type User,
} from "@/lib/api";
interface Auth {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  const reloadProfile = async () => {
    const data = await api<{ user: User; profile: Profile }>("/auth/me");
    setUser(data.user);
    setProfile(data.profile);
  };
  useEffect(() => {
    let active = true;
    void refreshSession()
      .then(async (data) => {
        if (active) {
          setUser(data.user);
          await reloadProfile();
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setProfile(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expire = () => {
      setUser(null);
      setProfile(null);
      cache.clear();
    };
    window.addEventListener("careloop:expired", expire);
    return () => {
      active = false;
      window.removeEventListener("careloop:expired", expire);
    };
  }, [cache]);
  const login = async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    cache.clear();
    setAccessToken(data.accessToken);
    setUser(data.user);
    await reloadProfile();
  };
  const register = async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    const data = await api<{ accessToken: string; user: User }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, displayName, synthetic: true }),
      },
    );
    cache.clear();
    setAccessToken(data.accessToken);
    setUser(data.user);
    await reloadProfile();
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
      setProfile(null);
      cache.clear();
    }
  };
  return (
    <Context.Provider
      value={{ user, profile, loading, login, register, logout, reloadProfile }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
