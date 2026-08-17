import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const finishLoading = () => {
      if (!mounted || resolved) return;
      resolved = true;
      setLoading(false);
    };

    // 1. Listener PRIMEIRO (evita race condition)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession((prev) => (prev?.access_token === newSession?.access_token ? prev : newSession));
      setUser((prev) => (prev?.id === newSession?.user?.id ? prev : newSession?.user ?? null));
      finishLoading();
    });

    // 2. Depois pega sessão atual (geralmente vem do localStorage em ms)
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession((prev) => (prev?.access_token === currentSession?.access_token ? prev : currentSession));
      setUser((prev) => (prev?.id === currentSession?.user?.id ? prev : currentSession?.user ?? null));
      finishLoading();
    }).catch((error) => {
      console.error("Falha ao carregar sessão", error);
      finishLoading();
    });

    // Fallback curto: se em 1.2s nada respondeu, libera a tela
    // (evita spinner longo que parece "travamento / reload").
    const fallback = window.setTimeout(finishLoading, 1200);

    return () => {
      mounted = false;
      window.clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signOut }),
    [user, session, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
