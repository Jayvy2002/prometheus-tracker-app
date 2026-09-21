import { supabase } from '../../../lib/supabase';
import { captureSession } from '../../../lib/sessionScope';
import { normalizeJoinRequestStatus, resolveRelationshipState, type CoachPublicProfile, type CoachQualification, type CoachingRequest } from './marketplace';
import { normalizeSearchIntent, type CoachMatchExplanation, type MarketplaceSearchIntent } from './marketplaceMatch';

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
  const coachIds = [...new Set(rows.map(row => row.coach_id))];
  const clientIds = [...new Set(rows.map(row => row.client_id))];
  const [profiles, links] = await Promise.all([
    supabase.from('coach_profiles').select('coach_id,public_name').in('coach_id', coachIds),
    supabase.from('coach_client_links').select('coach_id,client_id,status,updated_at,created_at')
      .in('coach_id', coachIds)
      .in('client_id', clientIds),
  ]);
  if (!current()) throw Error('session_changed');
  if (profiles.error) throw profiles.error;
  if (links.error) throw links.error;
  const linkRows = links.data ?? [];
  return rows.map(row => ({
    ...row,
    status: normalizeJoinRequestStatus(row.status),
    coach_name: profiles.data?.find(item => item.coach_id === row.coach_id)?.public_name ?? null,
    relationship_state: resolveRelationshipState(row.coach_id, row.client_id, linkRows),
  }));
}

function asQualification(row: CoachQualification): CoachQualification {
  return row;
}

export async function readCoachQualifications(coachId: string): Promise<CoachQualification[]> {
  if (!OWNER_ID.test(coachId)) return [];
  const { data, error } = await supabase
    .from('coach_qualifications')
    .select('*')
    .eq('coach_id', coachId)
    .order('declared_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(asQualification);
}

export async function readMarketplaceSearchIntent(owner: string): Promise<MarketplaceSearchIntent | null> {
  if (!OWNER_ID.test(owner)) return null;
  const current = captureSession(owner);
  if (!current()) throw Error('session_changed');
  const { data, error } = await supabase
    .from('marketplace_search_intents')
    .select('*')
    .eq('athlete_id', owner)
    .maybeSingle();
  if (!current()) throw Error('session_changed');
  if (error) throw error;
  return data ? normalizeSearchIntent(data) : null;
}

export async function explainMarketplaceMatches(owner: string): Promise<Array<CoachMatchExplanation & { public_name?: string }>> {
  const current = captureSession(owner);
  if (!current()) throw Error('session_changed');
  const { data, error } = await supabase.rpc('explain_marketplace_matches');
  if (!current()) throw Error('session_changed');
  if (error) throw error;
  if (!Array.isArray(data)) throw Error('invalid_response');
  return data as Array<CoachMatchExplanation & { public_name?: string }>;
}

export async function uploadQualificationProof(owner: string, qualificationId: string, file: File): Promise<string> {
  if (!OWNER_ID.test(owner) || !OWNER_ID.test(qualificationId)) throw Error('invalid_response');
  const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg';
  const path = `${owner}/${qualificationId}/proof.${ext}`;
  const { error } = await supabase.storage.from('qualification-proofs').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}
