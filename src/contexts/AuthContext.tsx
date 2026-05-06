import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ENABLE_GOOGLE_CALENDAR } from '@/config/featureFlags';

const getCalendarRedirectUri = () => `${window.location.origin}/calendar-callback`;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  calendarConnected: boolean | null;
  signOut: () => Promise<void>;
  connectCalendar: () => Promise<void>;
  reconnectCalendar: () => Promise<void>;
  disconnectCalendar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  calendarConnected: null,
  signOut: async () => {},
  connectCalendar: async () => {},
  reconnectCalendar: async () => {},
  disconnectCalendar: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  const isInvalidRefreshTokenError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const authError = error as { code?: string; message?: string };
    return (
      authError.code === 'refresh_token_not_found' ||
      authError.message?.toLowerCase().includes('refresh token')
    );
  };

  const requestGoogleCalendarConsent = async () => {
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      const redirectUri = getCalendarRedirectUri();
      const params = new URLSearchParams({
        action: 'connect-url',
        redirectUri,
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${currentSession.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Falha ao iniciar conexão com Google Calendar');
      }

      window.location.assign(payload.url);
    } catch (error) {
      setCalendarConnected(false);
      console.error('Erro ao solicitar consentimento do Google Calendar:', error);
    }
  };

  const checkCalendarConnection = async (userId: string) => {
    // Integração desligada via flag — UI nunca enxerga "conectado".
    if (!ENABLE_GOOGLE_CALENDAR) {
      setCalendarConnected(false);
      return;
    }
    const { data, error } = await supabase
      .from('google_tokens')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      setCalendarConnected(false);
      return;
    }

    setCalendarConnected(!!data?.length);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (!nextSession?.user) {
        setCalendarConnected(null);
        return;
      }

      setCalendarConnected(null);
      void checkCalendarConnection(nextSession.user.id);
    });

    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      if (isInvalidRefreshTokenError(error)) {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setLoading(false);
        setCalendarConnected(null);
        return;
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);

      if (!initialSession?.user) {
        setCalendarConnected(null);
        return;
      }

      setCalendarConnected(null);
      void checkCalendarConnection(initialSession.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCalendarConnected(null);
  };

  const callDisconnect = async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (!currentSession?.access_token) {
      throw new Error('Sessão inválida. Faça login novamente.');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar?action=disconnect`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao desconectar Google Calendar');
    }
  };

  const connectCalendar = async () => {
    await requestGoogleCalendarConsent();
  };

  const reconnectCalendar = async () => {
    try {
      await callDisconnect();
    } catch (error) {
      console.error('Erro ao desconectar antes de reconectar:', error);
    }
    setCalendarConnected(false);
    await requestGoogleCalendarConsent();
  };

  const disconnectCalendar = async () => {
    await callDisconnect();
    setCalendarConnected(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        calendarConnected,
        signOut,
        connectCalendar,
        reconnectCalendar,
        disconnectCalendar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
