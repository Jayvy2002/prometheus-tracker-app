import { supabase } from './supabase';
import { getSessionOwner } from './sessionScope';
import type { CoachPublicProfile, CoachingRequest } from './marketplace';

export async function marketRpc<T>(name: string, args: Record<string, unknown>, owner: string): Promise<T> {
  if (getSessionOwner() !== owner) throw Error('session_changed');
  const { data, error } = await supabase.rpc(name, args);
  if (getSessionOwner() !== owner) throw Error('session_changed');
  if (error) throw error;
  if (!data) throw Error('invalid_response');
  return (Array.isArray(data) && data.length === 1 ? data[0] : data) as T;
}
export async function readCoachProfile(id: string): Promise<CoachPublicProfile | null> {
  const { data, error } = await supabase.from('coach_profiles').select('*').eq('coach_id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function readRequests(owner: string, page = 0): Promise<CoachingRequest[]> {
  const { data, error } = await supabase.from('coach_join_requests').select('*')
    .or(`coach_id.eq.${owner},client_id.eq.${owner}`).order('created_at', { ascending: false }).order('id').range(page * 50, page * 50 + 50);
  if (error) throw error;
  return data ?? [];
}
