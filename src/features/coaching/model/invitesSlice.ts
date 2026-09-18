import {
  supabase,
} from '../../../lib/supabase';
import type {
  CoachInvite,
  CoachMessage,
} from '../../../lib/types';
import {
  mapCoachMessage,
} from '../../../lib/coachQueue';
import {
  ALL_ON_TRACKING,
} from '../../../lib/clientTracking';
import {
  track,
} from '../../../lib/telemetryClient';
import {
  cloneTracking,
} from '../../../lib/coachStoreGuards';
import {
  getSessionOwner,
} from '../../../lib/sessionScope';
import {
  directInviteConsentArgs,
} from '../../../lib/relationshipConsent';
import {
  coachingRuntime,
  CoachingGet,
  CoachingSet,
  CoachingState,
} from './coachingShared';
import {
  clearIntendedCoachingRole,
  clearPendingInviteToken,
} from './sessionTokens';

export function createInvitesSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchInvites' | 'createInvite' | 'revokeInvite' | 'fetchMyCoach' | 'acceptInvite' | 'previewInvite' > {
  return {
  fetchInvites: async () => {
    const { data } = await supabase
      .from('coach_invites')
      .select('*')
      .order('created_at', { ascending: false });
    set({ invites: (data ?? []) as CoachInvite[] });
  },

  createInvite: async (opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const days = opts?.days ?? 7;
    const maxUses = opts?.maxUses ?? 1;
    const token = crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await supabase
      .from('coach_invites')
      .insert({
        coach_id: user.id,
        token,
        expires_at: expires,
        max_uses: maxUses,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to create invite' };
    track('invite_created', { days, max_uses: maxUses });
    set(s => ({ invites: [data as CoachInvite, ...s.invites] }));
    return { token };
  },

  revokeInvite: async (id) => {
    await supabase.from('coach_invites').delete().eq('id', id);
    set(s => ({ invites: s.invites.filter(i => i.id !== id) }));
  },

  fetchMyCoach: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({
        myCoach: null,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: true,
      });
      return;
    }
    const { data: link } = await supabase
      .from('coach_client_links')
      .select('coach_id')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) {
      set({
        myCoach: null,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: get().coachingRole !== 'client',
      });
      if (get().coachingRole === 'client') await get().fetchMyTrackingConfig();
      return;
    }
    // S03 : carte coach minimale via RPC — le client ne lit plus user_profiles.
    const { data: card } = await supabase.rpc('get_my_coach_card').maybeSingle();
    const profile = card as { coach_id: string; full_name: string; avatar_url: string | null } | null;
    const coachId = (profile?.coach_id as string | undefined) || (link.coach_id as string);
    const previous = get().myCoach;
    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const messages = (msgs ?? [])
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at);
    set({
      myCoach: {
        id: coachId,
        full_name: (profile?.full_name as string) || previous?.full_name || '',
        avatar_url: (profile?.avatar_url as string) || previous?.avatar_url || '',
      },
      latestCoachMessage: unread[0] ?? null,
      ...(get().accountWorkspace === 'personal' ? { sentMessages: messages, unreadMessageCount: unread.length } : {}),
    });
    await get().fetchMyTrackingConfig();
  },

  acceptInvite: async (token) => {
    const accountId = getSessionOwner();
    if (!accountId) return { ok: false, error: 'not_authenticated' };
    if (coachingRuntime.acceptInviteInFlight) return { ok: false, error: 'operation_pending' };
    coachingRuntime.acceptInviteInFlight = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) return { ok: false, error: 'not_authenticated' };
      const { data, error } = await supabase.rpc('accept_coach_invite', {
        p_token: token,
        ...directInviteConsentArgs(),
      });
      if (getSessionOwner() !== accountId) return { ok: false, error: 'session_changed' };
      if (error) return { ok: false, error: error.message };
      const result = data as { ok?: boolean; error?: string; coach_name?: string } | null;
      if (result?.ok !== true) return { ok: false, error: result?.error ?? 'invalid_response' };
      clearPendingInviteToken();
      clearIntendedCoachingRole();
      await get().fetchMyCoach();
      if (getSessionOwner() === accountId) await get().fetchMyRole(accountId);
      track('invite_accepted');
      return { ok: true, coach_name: result.coach_name };
    } catch {
      return { ok: false, error: getSessionOwner() === accountId ? 'network' : 'session_changed' };
    } finally {
      coachingRuntime.acceptInviteInFlight = false;
    }
  },

  previewInvite: async (token) => {
    const { data, error } = await supabase.rpc('get_coach_invite_preview', { p_token: token });
    if (error) return { valid: false, coach_name: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { valid: false, coach_name: null };
    return {
      valid: !!row.valid,
      coach_name: (row.coach_name as string) || null,
    };
  },
  };
}
