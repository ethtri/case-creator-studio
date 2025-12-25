import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isEmailVerified: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isVerifiedEmail = (user: User | null): boolean => {
  if (!user) return false;
  const confirmed = user.email_confirmed_at ?? user.confirmed_at ?? null;
  if (confirmed) return true;
  const metadata = user.user_metadata as Record<string, unknown> | null;
  return metadata?.email_verified === true;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[AUTH] Failed to get session:", error);
    }
    setSession(data?.session ?? null);
    setUser(data?.session?.user ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      await refreshSession();
      if (mounted) setIsLoading(false);
    };
    initialize();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    isLoading,
    isEmailVerified: isVerifiedEmail(user),
    refreshSession,
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[AUTH] Failed to sign out:", error);
      }
    },
  }), [session, user, isLoading, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
