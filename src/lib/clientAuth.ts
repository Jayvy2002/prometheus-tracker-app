/**
 * Client login is a gym door: the first valid tap must sign in.
 * Helpers stay UI-agnostic so the first-submit contract can be unit-tested.
 */

export type AuthSnapshotEvent =
  | 'getSession'
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'PASSWORD_RECOVERY'
  | 'USER_UPDATED'
  | 'other';

/** Submit is never gated on auth bootstrap. Only an in-flight submit disables the door. */
export function clientLoginSubmitEnabled(opts: {
  submitting: boolean;
  authLoading: boolean;
  authInitialized: boolean;
}): boolean {
  void opts.authLoading;
  void opts.authInitialized;
  return !opts.submitting;
}

/** Prefer native form values (autofill) over React state that may still be empty. */
export function credentialsFromLoginForm(input: {
  formEmail?: string | null;
  formPassword?: string | null;
  stateEmail: string;
  statePassword: string;
}): { email: string; password: string } {
  const formEmail = (input.formEmail ?? '').trim();
  const stateEmail = input.stateEmail.trim();
  const formPassword = input.formPassword ?? '';
  return {
    email: formEmail || stateEmail,
    password: formPassword || input.statePassword,
  };
}

/**
 * A late getSession / INITIAL_SESSION(null) must not wipe a user that signIn
 * already committed. Generation bumps on signIn/signOut invalidate in-flight bootstrap.
 */
export function shouldCommitAuthSnapshot(opts: {
  event: AuthSnapshotEvent;
  incomingUserId: string | null;
  currentUserId: string | null;
  bootstrapGeneration: number;
  currentGeneration: number;
}): boolean {
  if (opts.event === 'getSession' || opts.event === 'INITIAL_SESSION') {
    if (opts.bootstrapGeneration !== opts.currentGeneration) return false;
    if (!opts.incomingUserId && opts.currentUserId) return false;
  }
  return true;
}

export function authSnapshotEvent(event: string): AuthSnapshotEvent {
  switch (event) {
    case 'INITIAL_SESSION':
    case 'SIGNED_IN':
    case 'SIGNED_OUT':
    case 'TOKEN_REFRESHED':
    case 'PASSWORD_RECOVERY':
    case 'USER_UPDATED':
      return event;
    default:
      return 'other';
  }
}

/** First valid submit always calls signIn — never swallowed because auth is still booting. */
export async function submitClientLogin(opts: {
  formEmail: string;
  formPassword: string;
  stateEmail: string;
  statePassword: string;
  submitting: boolean;
  authLoading: boolean;
  authInitialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
}): Promise<{ accepted: boolean; error: string | null }> {
  if (!clientLoginSubmitEnabled(opts)) {
    return { accepted: false, error: null };
  }
  const { email, password } = credentialsFromLoginForm(opts);
  if (!email || !password) {
    return { accepted: false, error: null };
  }
  const result = await opts.signIn(email, password);
  return { accepted: true, error: result.error };
}
