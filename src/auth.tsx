import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getApi } from "./api";
import type { SessionState } from "./api/types";

interface AuthValue {
  configured: boolean;
  demo: boolean;
  loading: boolean;
  session: SessionState | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = getApi();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(api.isConfigured);

  useEffect(() => {
    if (!api.isConfigured) return;
    return api.onSession((next) => {
      setSession(next);
      setLoading(false);
    });
  }, [api]);

  const value = useMemo<AuthValue>(
    () => ({
      configured: api.isConfigured,
      demo: api.isDemo,
      loading,
      session,
      refresh: async () => {
        setSession(await getApi().refreshSession());
      },
      signOut: () => getApi().signOut(),
    }),
    [api, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("auth missing");
  return value;
}
