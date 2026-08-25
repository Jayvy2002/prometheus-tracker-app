import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  deleteAccount: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.error ?? 'Failed to delete account' };
    }

    await supabase.auth.signOut();
    set({ user: null, session: null });
    return { error: null };
  },

  initialize: () => {
    // Guard against double-invocation (React StrictMode, hot-reload)
    if (get().initialized) return;
    set({ initialized: true });

    // Safety net: never stay stuck on the loading screen more than 8 seconds
    const timeout = setTimeout(() => {
      if (get().loading) {
        console.error('[Prometheus] Auth timed out — forcing loading=false. Check console for errors.');
        set({ loading: false });
      }
    }, 8000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        set({ session, user: session?.user ?? null, loading: false });
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        console.error('[Prometheus] getSession() failed:', err);
        set({ loading: false });
      });

    supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      set({ session, user: session?.user ?? null, loading: false });
    });
  },
}));
