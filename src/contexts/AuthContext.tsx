import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const upsertGoogleTokens = async (session: Session) => {
    if (session.user.app_metadata.provider !== 'google' || !session.provider_token) {
      return;
    }

    const { error } = await supabase.from('google_tokens').upsert(
      {
        user_id: session.user.id,
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token ?? null,
        expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('Erro ao salvar tokens do Google Calendar:', error.message);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session) {
          void upsertGoogleTokens(session);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session) {
        void upsertGoogleTokens(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
