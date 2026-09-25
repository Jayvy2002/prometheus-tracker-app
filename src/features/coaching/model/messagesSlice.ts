import { captureSession } from '../../../lib/sessionScope';
import {
  supabase,
} from '../../../lib/supabase';
import type { CoachMessage } from '../../../lib/types';
import {
  mapCoachMessage,
} from '../../../lib/coachQueue';
import {
  bilanInsertFields,
  normalizeBilanRef,
} from '../../../lib/messageBilan';
import {
  confirmedReadIds,
} from '../../../lib/messageDrafts';
import { MARKETPLACE_MESSAGE_MAX_LENGTH } from '../../../lib/marketplace';
import { objectRefInsertFields } from '../../messages/domain/messageContent';
import {
  liveMessageState,
} from '../../../lib/clientLive';
import {
  track,
} from '../../../lib/telemetryClient';
import {
  CoachingGet,
  CoachingSet,
  CoachingState,
} from './coachingShared';

export function createMessagesSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchCoachMessages' | 'fetchThreadPage' | 'fetchUnreadCounts' | 'sendCoachMessage' | 'sendClientReply' | 'markCoachMessageRead' | 'markThreadRead' > {
  return {
  fetchCoachMessages: async () => {
    const sessionCurrent = captureSession();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ sentMessages: [], unreadMessageCount: 0 });
      return;
    }
    const inCoaching = get().accountSnapshot?.coachCapability && get().accountWorkspace === 'coaching';
    let query = supabase
      .from('coach_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    query = inCoaching ? query.eq('coach_id', user.id) : query.eq('client_id', user.id);
    const workspace = get().accountWorkspace;
    const { data, error } = await query;
    if (!sessionCurrent() || get().accountWorkspace !== workspace) return;
    if (error || !data) {
      set({ sentMessages: [], messagesFetchError: true });
      return;
    }
    const messages = data
      .map(row => mapCoachMessage(row as Record<string, unknown>))
      .filter((row): row is CoachMessage => !!row);
    const unread = messages.filter(m => m.sender_id !== user.id && !m.read_at).length;
    set({ sentMessages: messages, unreadMessageCount: unread, messagesFetchError: false });
    // C02 : les compteurs exacts viennent du serveur (le chargement global est borné).
    void get().fetchUnreadCounts();
  },

  fetchThreadPage: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || get().threadExhausted[clientId]) return;
    const thread = get().sentMessages
      .filter(m => m.client_id === clientId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const before = thread.length > 0 ? thread[0].created_at : null;
    const { data, error } = await supabase.rpc('fetch_thread_messages', {
      p_client_id: clientId,
      p_before: before,
      p_limit: 50,
    });
    if (error || !data) return;
    const page = (data as Record<string, unknown>[])
      .map(row => mapCoachMessage(row))
      .filter((row): row is CoachMessage => !!row);
    if (page.length === 0) {
      set(s => ({ threadExhausted: { ...s.threadExhausted, [clientId]: true } }));
      return;
    }
    set(s => {
      const known = new Set(s.sentMessages.map(m => m.id));
      const fresh = page.filter(m => !known.has(m.id));
      return { sentMessages: [...s.sentMessages, ...fresh] };
    });
  },

  fetchUnreadCounts: async () => {
    const sessionCurrent = captureSession();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.rpc('count_unread_messages');
    if (!sessionCurrent()) return;
    const rows = (data ?? []) as Array<{ client_id: string; unread_count: number }>;
    const inCoaching = get().accountSnapshot?.coachCapability && get().accountWorkspace === 'coaching';
    const total = rows.filter(row => inCoaching ? row.client_id !== user.id : row.client_id === user.id)
      .reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
    set({ unreadMessageCount: total });
  },

  sendCoachMessage: async (clientId, body, templateKey, clientMsgId, bilan, extras) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const trimmed = body.trim().slice(0, MARKETPLACE_MESSAGE_MAX_LENGTH);
    const attachments = extras?.attachments ?? [];
    if (!trimmed && attachments.length === 0) return { error: 'empty' };
    // C02 : idempotence retry — même client_msg_id = un seul message.
    const msgId = clientMsgId ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        sender_id: user.id,
        body: trimmed,
        template_key: templateKey,
        client_msg_id: msgId,
        ...bilanInsertFields(normalizeBilanRef(bilan)),
        ...objectRefInsertFields(extras?.ref),
        reply_to_id: extras?.replyToId ?? null,
        attachments,
      })
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        // Retry après succès : le message existe déjà, on le réconcilie.
        const { data: existing } = await supabase
          .from('coach_messages')
          .select()
          .eq('sender_id', user.id)
          .eq('client_msg_id', msgId)
          .maybeSingle();
        const mapped = existing ? mapCoachMessage(existing as Record<string, unknown>) : null;
        if (mapped) {
          set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
          return { error: null };
        }
      }
      return { error: error.message ?? 'Failed to send' };
    }
    if (!data) return { error: 'Failed to send' };
    track('coach_message_sent', { template_key: templateKey });
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_nudged_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => ({
      ...liveMessageState(s.sentMessages, 'INSERT', mapped, user.id),
      clients: s.clients.map(c => (c.id === clientId ? { ...c, last_nudged_at: iso } : c)),
      opsRows: s.opsRows.map(row => (
        row.client.id === clientId
          ? { ...row, client: { ...row.client, last_nudged_at: iso } }
          : row
      )),
    }));
    return { error: null };
  },

  sendClientReply: async (body, clientMsgId, coachId, extras) => {
    const { data: { user } } = await supabase.auth.getUser();
    const pCoachId = coachId ?? get().myCoach?.id;
    if (!user || !pCoachId) return { error: 'Not authenticated' };
    const trimmed = body.trim().slice(0, MARKETPLACE_MESSAGE_MAX_LENGTH);
    const attachments = extras?.attachments ?? [];
    if (!trimmed && attachments.length === 0) return { error: 'empty' };
    const msgId = clientMsgId ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        coach_id: pCoachId,
        client_id: user.id,
        sender_id: user.id,
        body: trimmed,
        template_key: 'reply',
        client_msg_id: msgId,
        // The athlete can point at their own session, check-in, goal or exercise too.
        ...bilanInsertFields(normalizeBilanRef(extras?.bilan)),
        ...objectRefInsertFields(extras?.ref),
        reply_to_id: extras?.replyToId ?? null,
        attachments,
      })
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('coach_messages')
          .select()
          .eq('sender_id', user.id)
          .eq('client_msg_id', msgId)
          .maybeSingle();
        const mapped = existing ? mapCoachMessage(existing as Record<string, unknown>) : null;
        if (mapped) {
          set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
          return { error: null };
        }
      }
      return { error: error.message ?? 'Failed to send' };
    }
    if (!data) return { error: 'Failed to send' };
    track('client_reply_sent');
    const mapped = mapCoachMessage(data as Record<string, unknown>);
    set(s => liveMessageState(s.sentMessages, 'INSERT', mapped, user.id));
    return { error: null };
  },

  markCoachMessageRead: async (id) => {
    const iso = new Date().toISOString();
    const { data, error } = await supabase.from('coach_messages').update({ read_at: iso }).eq('id', id).select('id');
    const confirmed = confirmedReadIds(data);
    if (error || !confirmed.includes(id)) return;
    set(s => ({
      latestCoachMessage: s.latestCoachMessage?.id === id ? null : s.latestCoachMessage,
      sentMessages: s.sentMessages.map(m => (m.id === id ? { ...m, read_at: iso } : m)),
      unreadMessageCount: Math.max(0, s.unreadMessageCount - 1),
    }));
  },

  markThreadRead: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const iso = new Date().toISOString();
    const unread = get().sentMessages.filter(m => m.client_id === clientId && m.sender_id !== user.id && !m.read_at);
    if (unread.length === 0) return;
    const { data, error } = await supabase
      .from('coach_messages')
      .update({ read_at: iso })
      .in('id', unread.map(m => m.id))
      .select('id');
    if (error) return;
    const confirmed = new Set(confirmedReadIds(data));
    if (confirmed.size === 0) return;
    set(s => ({
      sentMessages: s.sentMessages.map(m => (
        confirmed.has(m.id) ? { ...m, read_at: iso } : m
      )),
      latestCoachMessage: s.latestCoachMessage && confirmed.has(s.latestCoachMessage.id)
        ? null
        : s.latestCoachMessage,
      unreadMessageCount: Math.max(0, s.unreadMessageCount - confirmed.size),
    }));
  },
  };
}
