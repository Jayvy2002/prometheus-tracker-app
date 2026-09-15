import { supabase } from '../../../lib/supabase';
import { captureSession } from '../../../lib/sessionScope';
import type { CoachPublicProfile, CoachingRequest } from './marketplace';

const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function marketRpc<T>(name: string, args: Record<string, unknown>, owner: string): Promise<T> {
  const current = captureSession(owner);
  if (!current()) throw Error('session_changed');
  const { data, error } = await supabase.rpc(name, args);
  if (!current()) throw Error('session_changed');
  if (error) throw error;
  if (!data) throw Error('invalid_response');
  return (Array.isArray(data) && data.length === 1 ? data[0] : data) as T;
}
export async function readCoachProfile(id: string): Promise<CoachPublicProfile | null> {
  if (!OWNER_ID.test(id)) return null;
  const { data, error } = await supabase.from('coach_profiles').select('*').eq('coach_id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function readRequests(owner: string, page = 0): Promise<CoachingRequest[]> {
  if (!OWNER_ID.test(owner)) throw Error('invalid_response');
  const current = captureSession(owner);
  if (!current()) throw Error('session_changed');
  const { data, error } = await supabase.from('coach_join_requests').select('*')
    .or(`coach_id.eq.${owner},client_id.eq.${owner}`).order('created_at', { ascending: false }).order('id').range(page * 50, page * 50 + 50);
  if (!current()) throw Error('session_changed');
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const [profiles, consents] = await Promise.all([
    supabase.from('coach_profiles').select('coach_id,public_name')
      .in('coach_id', [...new Set(rows.map(row => row.coach_id))]),
    supabase.from('coaching_relationship_consents').select('join_request_id,revoked_at')
      .in('join_request_id', rows.map(row => row.id)),
  ]);
  if (!current()) throw Error('session_changed');
  if (profiles.error) throw profiles.error;
  if (consents.error) throw consents.error;
  return rows.map(row => {
    const consent = consents.data?.find(item => item.join_request_id === row.id);
    return {
      ...row,
      coach_name: profiles.data?.find(item => item.coach_id === row.coach_id)?.public_name ?? null,
      relationship_state: consent ? (consent.revoked_at ? 'ended' : 'active') : 'unknown',
    };
  });
}
