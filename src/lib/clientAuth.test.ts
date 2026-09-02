import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  authDoorCanRegister,
  authSnapshotEvent,
  clientLoginErrorCopy,
  clientLoginSubmitEnabled,
  credentialsFromLoginForm,
  shouldCommitAuthSnapshot,
  submitClientLogin,
  postLoginPath,
} from './clientAuth';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('first submit is enabled even if auth bootstrap is still loading', () => {
  assert.equal(clientLoginSubmitEnabled({
    submitting: false,
    authLoading: true,
    authInitialized: false,
  }), true);
  assert.equal(clientLoginSubmitEnabled({
    submitting: false,
    authLoading: false,
    authInitialized: true,
  }), true);
  assert.equal(clientLoginSubmitEnabled({
    submitting: true,
    authLoading: false,
    authInitialized: true,
  }), false);
});

test('autofill form values win over empty React state', () => {
  const creds = credentialsFromLoginForm({
    formEmail: '  jade@gym.test ',
    formPassword: 'secret12',
    stateEmail: '',
    statePassword: '',
  });
  assert.equal(creds.email, 'jade@gym.test');
  assert.equal(creds.password, 'secret12');
});

test('late getSession/INITIAL_SESSION null must not wipe a signed-in user', () => {
  assert.equal(shouldCommitAuthSnapshot({
    event: 'getSession',
    incomingUserId: null,
    currentUserId: 'jade',
    bootstrapGeneration: 1,
    currentGeneration: 2,
  }), false);
  assert.equal(shouldCommitAuthSnapshot({
    event: 'INITIAL_SESSION',
    incomingUserId: null,
    currentUserId: 'jade',
    bootstrapGeneration: 1,
    currentGeneration: 1,
  }), false);
  assert.equal(shouldCommitAuthSnapshot({
    event: 'getSession',
    incomingUserId: null,
    currentUserId: null,
    bootstrapGeneration: 1,
    currentGeneration: 1,
  }), true);
  assert.equal(shouldCommitAuthSnapshot({
    event: 'SIGNED_IN',
    incomingUserId: 'jade',
    currentUserId: null,
    bootstrapGeneration: 1,
    currentGeneration: 2,
  }), true);
  assert.equal(shouldCommitAuthSnapshot({
    event: 'SIGNED_OUT',
    incomingUserId: null,
    currentUserId: 'jade',
    bootstrapGeneration: 1,
    currentGeneration: 2,
  }), true);
  assert.equal(authSnapshotEvent('INITIAL_SESSION'), 'INITIAL_SESSION');
  assert.equal(authSnapshotEvent('weird'), 'other');
});

test('login errors from GoTrue are shown in the app locale', () => {
  const t = (key: string) => {
    if (key === 'auth.invalidCredentials') return 'E-mail ou mot de passe incorrect.';
    return key;
  };
  assert.equal(
    clientLoginErrorCopy('Invalid login credentials', t),
    'E-mail ou mot de passe incorrect.',
  );
  assert.equal(clientLoginErrorCopy('Network error', t), 'Network error');
});

test('post-login route is clean unless a safe deep-link was explicit', () => {
  assert.equal(postLoginPath(), '/dashboard');
  assert.equal(postLoginPath('/profile'), '/profile');
  assert.equal(postLoginPath('//evil.test'), '/dashboard');
  assert.equal(postLoginPath('/auth'), '/dashboard');
});

test('first valid client login submit signs in even while auth is booting', async () => {
  const calls: Array<{ email: string; password: string }> = [];
  const result = await submitClientLogin({
    formEmail: 'jade@gym.test',
    formPassword: 'secret12',
    stateEmail: '',
    statePassword: '',
    submitting: false,
    authLoading: true,
    authInitialized: false,
    signIn: async (email, password) => {
      calls.push({ email, password });
      return { error: null };
    },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.error, null);
  assert.deepEqual(calls, [{ email: 'jade@gym.test', password: 'secret12' }]);
});

test('in-flight submit is not launched twice; empty creds do not call signIn', async () => {
  let calls = 0;
  const signIn = async () => {
    calls += 1;
    return { error: null };
  };
  const skipped = await submitClientLogin({
    formEmail: 'jade@gym.test',
    formPassword: 'secret12',
    stateEmail: '',
    statePassword: '',
    submitting: true,
    authLoading: false,
    authInitialized: true,
    signIn,
  });
  assert.equal(skipped.accepted, false);
  assert.equal(calls, 0);

  const empty = await submitClientLogin({
    formEmail: '',
    formPassword: '',
    stateEmail: '',
    statePassword: '',
    submitting: false,
    authLoading: false,
    authInitialized: true,
    signIn,
  });
  assert.equal(empty.accepted, false);
  assert.equal(calls, 0);
});

test('auth doors: coach and solo register freely; coached client only via invite', () => {
  assert.equal(authDoorCanRegister('coach', false), true);
  assert.equal(authDoorCanRegister('solo', false), true);
  assert.equal(authDoorCanRegister('client', false), false);
  assert.equal(authDoorCanRegister('client', true), true);
  assert.equal(authDoorCanRegister(null, false), false);
});

test('AuthPage: three doors; client stays login-only unless invited; first submit is not gated on auth loading', () => {
  const page = src('src/components/auth/AuthPage.tsx');
  assert.match(page, /canRegister = authDoorCanRegister\(role, fromInvite\)/);
  assert.match(page, /chooseRole\('solo'\)/);
  assert.match(page, /auth\.soloEntry/);
  assert.match(page, /auth\.goSolo/);
  assert.match(page, /credentialsFromLoginForm/);
  assert.match(page, /submitClientLogin|submittingRef/);
  assert.match(page, /name="email"/);
  assert.match(page, /name="password"/);
  assert.match(page, /pressOnly/);
  assert.match(page, /auth\.clientNeedsInvite/);
  assert.match(page, /auth\.signingInAsClient/);
  assert.match(page, /chooseRole\('client'\)/);
  assert.match(page, /chooseRole\('coach'\)/);
  assert.match(page, /clientLoginErrorCopy/);
  assert.doesNotMatch(page, /useAuthStore\([^)]*loading/);
  assert.doesNotMatch(page, /disabled=\{!initialized/);
  assert.doesNotMatch(page, /disabled=\{authLoading/);
  assert.doesNotMatch(page, /setIntendedCoachingRole\('client'\)/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /clientNeedsInvite: 'Pas encore de compte \? Ton coach t’envoie un lien/);
  assert.match(fr, /signIn: 'Se connecter'/);
  assert.match(fr, /clientEntry: 'Connexion client'/);
  assert.match(fr, /invalidCredentials: 'E-mail ou mot de passe incorrect\.'/);
});

test('authStore: signIn commits the session; late getSession cannot eat it', () => {
  const store = src('src/stores/authStore.ts');
  assert.match(store, /shouldCommitAuthSnapshot/);
  assert.match(store, /bootstrapGeneration/);
  assert.match(store, /signInWithPassword/);
  assert.match(store, /data\.session/);
  assert.match(store, /currentGeneration \+= 1/);
});

test('PR 34 first-run empty states stay in place', () => {
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /isClientFirstRun/);
  assert.match(dash, /clientHomeNextAction/);
  assert.match(dash, /calmHome/);
});
