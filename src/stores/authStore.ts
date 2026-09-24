import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { setSessionOwner } from '../lib/sessionScope';
import type { User, Session } from '@supabase/supabase-js';
import { authSnapshotEvent, shouldCommitAuthSnapshot } from '../lib/clientAuth';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  initialize: () => void;
}

/** Invalidates in-flight getSession / INITIAL_SESSION after sign-in or sign-out. */
let currentGeneration = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  passwordRecovery: false,

  signUp: async (email, password) => {
    currentGeneration += 1;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    if (data.session) {
      setSessionOwner(data.session.user.id);
      set({ session: data.session, user: data.session.user, loading: false });
    }
    if (!data.session) return { error: null, needsConfirmation: true };
    return { error: null };
  },

  signIn: async (email, password) => {
    currentGeneration += 1;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.session) {
      setSessionOwner(data.session.user.id);
      set({ session: data.session, user: data.session.user, loading: false });
    }
    return { error: null };
  },

  resetPasswordForEmail: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    set({ passwordRecovery: false });
    return { error: null };
  },

  clearPasswordRecovery: () => set({ passwordRecovery: false }),

  signOut: async () => {
    currentGeneration += 1;
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  // Vision §30: a request opens the recovery window; the server purges when it is due.
  // The session stays so the person lands on the recovery screen and can still undo.
  deleteAccount: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) return { error: error.message.includes('last_operator') ? 'last_operator' : error.message };
    return { error: null };
  },

  initialize: () => {
    // Guard against double-invocation (React StrictMode, hot-reload)
    if (get().initialized) return;
    set({ initialized: true });
    const bootstrapGeneration = currentGeneration;

    // Safety net: never stay stuck on the loading screen more than 8 seconds
    const timeout = setTimeout(() => {
      if (get().loading) {
        console.error('[Prometheus] Auth timed out — forcing loading=false. Check console for errors.');
        set({ loading: false });
      }
    }, 8000);

    const applySession = (
      event: Parameters<typeof shouldCommitAuthSnapshot>[0]['event'],
      session: Session | null,
    ) => {
      if (!shouldCommitAuthSnapshot({
        event,
        incomingUserId: session?.user?.id ?? null,
        currentUserId: get().user?.id ?? null,
        bootstrapGeneration,
        currentGeneration,
      })) {
        if (get().loading) set({ loading: false });
        return;
      }
      // TOKEN_REFRESHED / SIGNED_IN on tab focus recreate the user object. Keep the
      // existing reference so App's `user.id` effect does not remount the tree.
      if (session?.user?.id && session.user.id === get().user?.id) {
        setSessionOwner(session.user.id);
        set({
          session,
          loading: false,
          passwordRecovery: event === 'PASSWORD_RECOVERY' ? true : get().passwordRecovery,
        });
        return;
      }
      if (session?.user?.id) setSessionOwner(session.user.id);
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        passwordRecovery: event === 'PASSWORD_RECOVERY' ? true : get().passwordRecovery,
      });
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        applySession('getSession', session);
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        console.error('[Prometheus] getSession() failed:', err);
        if (get().loading) set({ loading: false });
      });

    supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(timeout);
      applySession(authSnapshotEvent(event), session);
    });
  },
}));
