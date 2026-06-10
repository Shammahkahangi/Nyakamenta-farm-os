import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import {
  fetchEstateConfig,
  resolveEstateConfig,
  setEstateApiTokenGetter,
} from '../api/estateApi';
import { initEstateRoleFromUser, resetEstateRole } from './estateRole';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

type AuthState = {
  loading: boolean;
  signedIn: boolean;
  session: Session | null;
  user: User | null;
  localWebAuth: boolean;
  supabase: SupabaseClient | null;
  /** Shown on login when init had problems (e.g. server timeout). */
  initWarning: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInLocal: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function createSupabaseClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [localWebAuth, setLocalWebAuth] = useState(false);
  const [serverLocalWebAuth, setServerLocalWebAuth] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [useLocal, setUseLocal] = useState(false);
  const [initWarning, setInitWarning] = useState<string | null>(null);

  const signedIn = useLocal || !!session;

  useEffect(() => {
    let mounted = true;
    let client: SupabaseClient | null = null;

    (async () => {
      try {
        let cfg: Awaited<ReturnType<typeof resolveEstateConfig>>;
        try {
          cfg = await fetchEstateConfig();
        } catch (serverErr) {
          const msg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          cfg = await resolveEstateConfig();
          if (mounted) {
            setInitWarning(
              `${msg} Using Supabase keys from the app .env file. Data API calls still need the estate server when you open Farm/SACCO/Lodge.`
            );
          }
        }

        if (!mounted) return;
        setServerLocalWebAuth(!!cfg.localWebAuth);

        const url = cfg.supabaseUrl;
        const key = cfg.supabaseAnonKey;
        if (url && key) {
          client = createSupabaseClient(url, key);
          setSupabase(client);
          const { data } = await client.auth.getSession();
          if (data.session) {
            setSession(data.session);
            setUser(data.session.user);
            initEstateRoleFromUser(data.session.user);
          }
          client.auth.onAuthStateChange((_e, s) => {
            setSession(s);
            setUser(s?.user ?? null);
            if (s?.user) initEstateRoleFromUser(s.user);
            else if (!useLocal) resetEstateRole();
          });
        } else if (mounted) {
          setInitWarning(
            'Server returned no Supabase URL/key. Add SUPABASE_URL and SUPABASE_KEY to the PC .env and restart npm run web, or set EXPO_PUBLIC_SUPABASE_* in the mobile .env.'
          );
        }
      } catch (e) {
        console.warn('Auth init:', e);
        if (mounted) {
          setInitWarning(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [useLocal]);

  useEffect(() => {
    setEstateApiTokenGetter(async () => {
      if (useLocal) return 'local-dev';
      if (session?.access_token) return session.access_token;
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      }
      return null;
    });
  }, [session, supabase, useLocal]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error(
          initWarning ||
            'Supabase is not ready. Check the warning on this screen, fix EXPO_PUBLIC_ESTATE_API_URL / server, then restart the app (npx expo start -c).'
        );
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setUseLocal(false);
      if (data.user) initEstateRoleFromUser(data.user);
    },
    [supabase, initWarning]
  );

  const signInLocal = useCallback(async () => {
    try {
      const cfg = await fetchEstateConfig();
      if (!cfg.localWebAuth) {
        throw new Error('Local dev auth not enabled on server (add ESTATE_LOCAL_WEB_AUTH=1 to PC .env and restart npm run web)');
      }
    } catch {
      if (!serverLocalWebAuth) {
        throw new Error(
          'Cannot reach estate server to enable local dev. Start npm run web on your PC, or fix EXPO_PUBLIC_ESTATE_API_URL.'
        );
      }
    }
    setUseLocal(true);
    initEstateRoleFromUser({ app_metadata: { estate_role: 'owner' } });
  }, [serverLocalWebAuth]);

  const signOut = useCallback(async () => {
    setUseLocal(false);
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    resetEstateRole();
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        signedIn,
        session,
        user,
        localWebAuth: serverLocalWebAuth,
        supabase,
        initWarning,
        signIn,
        signInLocal,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
