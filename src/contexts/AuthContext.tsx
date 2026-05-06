import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Mantido por compatibilidade — sempre false (integração removida). */
  calendarConnected: boolean | null;
  signOut: () => Promise<void>;
  /** No-op (integração removida). */
  connectCalendar: () => Promise<void>;
  /** No-op (integração removida). */
  reconnectCalendar: () => Promise<void>;
  /** No-op (integração removida). */
  disconnectCalendar: () => Promise<void>;
}

const noop = async () => {};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  calendarConnected: false,
  signOut: noop,
  connectCalendar: noop,
  reconnectCalendar: noop,
  disconnectCalendar: noop,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isInvalidRefreshTokenError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const authError = error as { code?: string; message?: string };
    return (
      authError.code === 'refresh_token_not_found' ||
      authError.message?.toLowerCase().includes('refresh token')
    );
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      if (isInvalidRefreshTokenError(error)) {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        calendarConnected: false,
        signOut,
        connectCalendar: noop,
        reconnectCalendar: noop,
        disconnectCalendar: noop,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
