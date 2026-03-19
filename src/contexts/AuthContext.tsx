import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  const checkCalendarConnection = async (userId: string) => {
    const { data } = await supabase
      .from('google_tokens')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    const connected = !!data?.length;
    setCalendarConnected(connected);

    // Auto-redirect to connect if not connected, user logged in with Google,
    // and we're not already on the callback page
    if (
      !connected &&
      !window.location.pathname.includes('calendar-callback') &&
      !window.location.pathname.includes('auth')
    ) {
      triggerCalendarConnect(userId);
    }
  };

  const triggerCalendarConnect = async (userId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;

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
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.url) {
        window.location.href = payload.url;
      }
    } catch (error) {
      console.error('Erro ao iniciar conexão com Google Calendar:', error);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user && session.user.app_metadata.provider === 'google') {
          // Save provider_token if available (only on initial sign-in)
          if (session.provider_token) {
            supabase.from('google_tokens').upsert(
              {
                user_id: session.user.id,
                access_token: session.provider_token,
                refresh_token: session.provider_refresh_token ?? null,
                expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
              },
              { onConflict: 'user_id' }
            ).then(({ error }) => {
              if (error) console.error('Erro ao salvar tokens:', error.message);
              else setCalendarConnected(true);
            });
          } else {
            // Check if we already have tokens stored
            void checkCalendarConnection(session.user.id);
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user && session.user.app_metadata.provider === 'google') {
        void checkCalendarConnection(session.user.id);
      }
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
