import type { CoachingRole } from '../../../lib/types';

const PENDING_INVITE_KEY = 'prometheus_pending_invite';
const INTENDED_ROLE_KEY = 'prometheus_intended_coaching_role';
const DEFER_ONBOARDING_KEY = 'prometheus_defer_onboarding';

export type IntendedCoachingRole = Extract<CoachingRole, 'coach' | 'client'>;

export function setPendingInviteToken(token: string) {
  try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* private mode */ }
  try { sessionStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* private mode */ }
}

export function getPendingInviteToken(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY) || sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteToken() {
  try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
}

export function setIntendedCoachingRole(role: IntendedCoachingRole) {
  try {
    localStorage.setItem(INTENDED_ROLE_KEY, role);
  } catch {
    // private mode / quota
  }
}

export function getIntendedCoachingRole(): IntendedCoachingRole | null {
  try {
    const value = localStorage.getItem(INTENDED_ROLE_KEY);
    return value === 'coach' || value === 'client' ? value : null;
  } catch {
    return null;
  }
}

export function clearIntendedCoachingRole() {
  try {
    localStorage.removeItem(INTENDED_ROLE_KEY);
  } catch {
    // ignore
  }
}

export function setOnboardingDeferred() {
  try {
    sessionStorage.setItem(DEFER_ONBOARDING_KEY, '1');
  } catch {
    // private mode / quota
  }
}

export function clearOnboardingDeferred() {
  try {
    sessionStorage.removeItem(DEFER_ONBOARDING_KEY);
  } catch {
    // ignore
  }
}

export function isOnboardingDeferred(): boolean {
  try {
    return sessionStorage.getItem(DEFER_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}
