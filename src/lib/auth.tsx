import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

// Set at sign-up; redeemed as soon as the user has a session (covers the
// email-confirmation case where redemption can't happen until they log in).
export const PENDING_CODE_KEY = 'mtp.pending_join_code';
const PROFILE_CACHE_KEY = 'mtp.profile';

type Profile = Tables<'profiles'>;

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  async function loadProfile(id: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (data) {
      setProfile(data);
      AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data)).catch(() => {});
    }
  }

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => {});
      return;
    }
    let active = true;
    (async () => {
      // Instant: paint the cached profile first so name/avatar/role show with
      // zero network wait. Then refresh from the server in the background.
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (active && cached) {
        const p = JSON.parse(cached) as Profile;
        if (p.id === userId) setProfile(p);
      }

      const code = await AsyncStorage.getItem(PENDING_CODE_KEY);
      if (code) {
        const { error } = await supabase.rpc('redeem_code', { p_code: code });
        if (!error) await AsyncStorage.removeItem(PENDING_CODE_KEY);
      }
      if (active) await loadProfile(userId);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const refreshProfile = async () => {
    if (userId) await loadProfile(userId);
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, isAdmin: profile?.role === 'admin', refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
