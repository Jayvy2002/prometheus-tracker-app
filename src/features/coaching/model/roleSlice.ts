import {
  supabase,
} from '../../../lib/supabase';
import type { CoachingRole } from '../../../lib/types';
import {
  ALL_OFF_TRACKING,
  ALL_ON_TRACKING,
} from '../../../lib/clientTracking';
import {
  cloneTracking,
  nextRoleAfterFetch,
  previousRoleForFetch,
} from '../../../lib/coachStoreGuards';
import i18n from '../../../i18n';
import {
  toast,
} from '../../../components/ui/Toast';
import {
  useProfileStore,
} from '../../../stores/profileStore';
import {
  getSessionOwner,
} from '../../../lib/sessionScope';
import {
  COACH_HAS_ACTIVE_CLIENTS,
  mapCoachingRoleError,
} from '../../../lib/coachModeGuard';
import {
  loadAccountWorkspace,
  persistAccountWorkspace,
  readAccountRole,
  parseAccountSnapshot,
} from '../../../lib/accountContext';
import {
  coachingRuntime,
  CoachingGet,
  CoachingSet,
  CoachingState,
  loadRememberedCoachingRole,
  persistRememberedCoachingRole,
} from './coachingShared';
import {
  clearIntendedCoachingRole,
  getIntendedCoachingRole,
  getPendingInviteToken,
} from './sessionTokens';

export function createRoleSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchMyRole' | 'selectAccountWorkspace' | 'chooseEntryIntention' | 'setCoachingRole' | 'applyIntendedCoachingRole' | 'enableCoachMode' | 'countActiveCoachLinks' | 'disableCoachMode' > {
  return {
  fetchMyRole: async (userId) => {
    const previous = previousRoleForFetch(get().coachingRole, loadRememberedCoachingRole(userId));
    try {
      const { data, error, snapshot } = await readAccountRole(
        userId,
        () => supabase.rpc('get_my_account_context'),
        () => supabase.from('user_roles').select('coaching_role').eq('user_id', userId).maybeSingle(),
      );
      if (getSessionOwner() !== userId) return;
      const outcome = nextRoleAfterFetch({
        previous,
        data: data as { coaching_role?: string | null } | null,
        error: error ? { message: error.message } : null,
      });
      if (outcome.error) {
        set({
          coachingRole: outcome.role,
          accountSnapshot: null,
          accountWorkspace: 'personal',
          coachingRoleError: outcome.error,
          roleReady: true,
        });
        toast(i18n.t('errors.loadRole'), 'error');
        return;
      }
      const role = outcome.role;
      persistRememberedCoachingRole(userId, role);
      set({
        coachingRole: role,
        accountSnapshot: snapshot,
        ...(snapshot ? { myCoach: snapshot.activeCoachId
          ? get().myCoach?.id === snapshot.activeCoachId ? get().myCoach
            : { id: snapshot.activeCoachId, full_name: '', avatar_url: '' }
          : null } : {}),
        accountWorkspace: snapshot?.coachCapability
          ? loadAccountWorkspace(userId) ?? 'coaching'
          : 'personal',
        roleReady: true,
        coachingRoleError: null,
        ...((snapshot ? !!snapshot.activeCoachId : role === 'client')
          ? { myTrackingConfig: cloneTracking(ALL_OFF_TRACKING), trackingReady: false }
          : { myTrackingConfig: cloneTracking(ALL_ON_TRACKING), trackingReady: true }),
      });
    } catch {
      if (getSessionOwner() !== userId) return;
      set({
        coachingRole: previous,
        accountSnapshot: null,
        accountWorkspace: 'personal',
        coachingRoleError: 'network',
        roleReady: true,
      });
      toast(i18n.t('errors.loadRole'), 'error');
    }
  },

  selectAccountWorkspace: (workspace) => {
    const accountId = getSessionOwner();
    const snapshot = get().accountSnapshot;
    if (!accountId || snapshot?.userId !== accountId || !snapshot.coachCapability) return;
    persistAccountWorkspace(accountId, workspace);
    set({ accountWorkspace: workspace, sentMessages: [], unreadMessageCount: 0, threadExhausted: {} });
  },

  chooseEntryIntention: async (intent) => {
    const accountId = getSessionOwner();
    if (!accountId) return { error: 'not_authenticated' };
    if (coachingRuntime.endMyCoachLinkInFlight || coachingRuntime.acceptInviteInFlight) return { error: 'operation_pending' };
    const { data, error } = await supabase.rpc('choose_account_intent', { p_intent: intent });
    if (getSessionOwner() !== accountId) return { error: 'session_changed' };
    if (error) return { error: error.message };
    const payload = data as { user_id?: string; intent?: string; coaching_role?: string } | null;
    if (!payload || payload.user_id !== accountId || payload.intent !== intent
      || !['none', 'client', 'coach'].includes(String(payload.coaching_role))) {
      return { error: 'invalid_response' };
    }
    const role = payload.coaching_role as CoachingRole;
    persistRememberedCoachingRole(accountId, role);
    useProfileStore.getState().applyEntryIntention(accountId, intent);
    set({ coachingRole: role, roleReady: true, coachingRoleError: null });
    await get().fetchMyRole(accountId);
    return { error: null };
  },

  setCoachingRole: async (role) => {
    const accountId = getSessionOwner();
    if (!accountId) return { error: 'not_authenticated' };
    const { data, error } = await supabase.rpc('set_coach_capability', { p_enabled: role === 'coach' });
    if (getSessionOwner() !== accountId) return { error: 'session_changed' };
    if (error) return { error: mapCoachingRoleError(error.message) };
    const snapshot = parseAccountSnapshot(data, accountId);
    if (!snapshot) return { error: 'invalid_account_context' };
    persistRememberedCoachingRole(accountId, snapshot.legacyRole);
    set({ coachingRole: snapshot.legacyRole, accountSnapshot: snapshot,
      accountWorkspace: snapshot.coachCapability ? get().accountWorkspace : 'personal',
      roleReady: true, coachingRoleError: null });
    return { error: null };
  },

  applyIntendedCoachingRole: async () => {
    if (getPendingInviteToken()) return;
    const intended = getIntendedCoachingRole();
    if (!intended) return;
    // Never promote a visitor to client from a leftover picker claim.
    // Client role is assigned only by accept_coach_invite.
    if (intended !== 'coach') {
      clearIntendedCoachingRole();
      return;
    }
    const result = await get().setCoachingRole(intended);
    if (!result.error) clearIntendedCoachingRole();
  },

  enableCoachMode: async () => get().setCoachingRole('coach'),

  countActiveCoachLinks: async () => {
    const accountId = getSessionOwner();
    if (!accountId) return { count: null, error: 'not_authenticated' };
    const { count, error } = await supabase
      .from('coach_client_links')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', accountId)
      .eq('status', 'active');
    if (getSessionOwner() !== accountId) return { count: null, error: 'session_changed' };
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  },

  disableCoachMode: async () => {
    const counted = await get().countActiveCoachLinks();
    if (counted.error) return { error: counted.error };
    if ((counted.count ?? 0) > 0) return { error: COACH_HAS_ACTIVE_CLIENTS };
    return get().setCoachingRole('none');
  },
  };
}
