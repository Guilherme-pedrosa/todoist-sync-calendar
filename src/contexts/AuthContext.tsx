import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  calendarConnected: boolean | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  calendarConnected: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const calendarConsentInFlightRef = useRef(false);

  const requestGoogleCalendarConsent = async (currentSession: Session) => {
    if (calendarConsentInFlightRef.current) return;
    calendarConsentInFlightRef.current = true;

    const redirectUri = `${window.location.origin}/calendar-callback`;
    const params = new URLSearchParams({
      action: 'connect-url',
      redirectUri,
    });

    try {
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
      calendarConsentInFlightRef.current = false;
      setCalendarConnected(false);
      console.error('Erro ao solicitar consentimento do Google Calendar:', error);
    }
  };

  const saveProviderTokens = async (currentSession: Session) => {
    if (!currentSession.user || !currentSession.provider_token) return false;

    const { data: existingToken } = await supabase
      .from('google_tokens')
      .select('refresh_token')
      .eq('user_id', currentSession.user.id)
      .maybeSingle();

    const refreshToken =
      currentSession.provider_refresh_token ?? existingToken?.refresh_token ?? null;

    const { error } = await supabase.from('google_tokens').upsert(
      {
        user_id: currentSession.user.id,
        access_token: currentSession.provider_token,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      calendarConsentInFlightRef.current = false;
      console.error('Erro ao salvar tokens Google:', error.message);
      return false;
    }

    calendarConsentInFlightRef.current = false;
    setCalendarConnected(true);
    return true;
  };

  const checkCalendarConnection = async (userId: string, currentSession: Session) => {
    const { data } = await supabase
      .from('google_tokens')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const connected = !!data?.length;
    setCalendarConnected(connected);

    if (connected) {
      calendarConsentInFlightRef.current = false;
      return;
    }

    if (
      !window.location.pathname.includes('auth') &&
      !window.location.pathname.includes('calendar-callback')
    ) {
      await requestGoogleCalendarConsent(currentSession);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);

        if (!nextSession?.user) {
          setCalendarConnected(null);
          calendarConsentInFlightRef.current = false;
          return;
        }

        if (nextSession.user.app_metadata.provider !== 'google') {
          setCalendarConnected(false);
          calendarConsentInFlightRef.current = false;
          return;
        }

        if (nextSession.provider_token) {
          void saveProviderTokens(nextSession);
          return;
        }

        void checkCalendarConnection(nextSession.user.id, nextSession);
      }
    );

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);

      if (!initialSession?.user) {
        setCalendarConnected(null);
        return;
      }

      if (initialSession.user.app_metadata.provider !== 'google') {
        setCalendarConnected(false);
        calendarConsentInFlightRef.current = false;
        return;
      }

      if (initialSession.provider_token) {
        void saveProviderTokens(initialSession);
        return;
      }

      void checkCalendarConnection(initialSession.user.id, initialSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCalendarConnected(null);
    calendarConsentInFlightRef.current = false;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, calendarConnected, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}