import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';

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

  const requestGoogleCalendarConsent = async () => {
    try {
      const { error } = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
        extraParams: {
          access_type: 'offline',
          prompt: 'consent',
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
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
      console.error('Erro ao salvar tokens Google:', error.message);
      return false;
    }

    setCalendarConnected(true);
    return true;
  };

  const checkCalendarConnection = async (userId: string) => {
    const { data } = await supabase
      .from('google_tokens')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const connected = !!data?.length;
    setCalendarConnected(connected);

    if (
      !connected &&
      !window.location.pathname.includes('auth') &&
      !window.location.pathname.includes('calendar-callback')
    ) {
      await requestGoogleCalendarConsent();
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
          return;
        }

        if (nextSession.user.app_metadata.provider !== 'google') {
          setCalendarConnected(false);
          return;
        }

        if (nextSession.provider_token) {
          void saveProviderTokens(nextSession);
          return;
        }

        void checkCalendarConnection(nextSession.user.id);
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
        return;
      }

      if (initialSession.provider_token) {
        void saveProviderTokens(initialSession);
        return;
      }

      void checkCalendarConnection(initialSession.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCalendarConnected(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, calendarConnected, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}