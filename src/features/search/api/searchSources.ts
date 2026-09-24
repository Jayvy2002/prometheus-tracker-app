import { supabase } from '../../../lib/supabase';
import { ilikePattern } from '../domain/globalSearch';

/**
 * Every query below runs as the signed-in person under RLS and is scoped to
 * their own rows (or the Coach's own threads): nothing here can list a
 * resource the person could not already open (Vision §33).
 */

export interface NamedRow { id: string; name: string | null }

export async function ownPrograms(userId: string): Promise<NamedRow[]> {
  const { data } = await supabase.from('programs').select('id, name').eq('owner_id', userId).order('updated_at', { ascending: false }).limit(300);
  return (data ?? []) as NamedRow[];
}

export async function ownRoutines(userId: string): Promise<NamedRow[]> {
  const { data } = await supabase.from('routines').select('id, name').eq('user_id', userId).limit(300);
  return (data ?? []) as NamedRow[];
}

export async function ownRecipes(userId: string): Promise<NamedRow[]> {
  const { data } = await supabase.from('recipes').select('id, name').eq('user_id', userId).limit(300);
  return (data ?? []) as NamedRow[];
}

export async function ownGoals(userId: string): Promise<Array<{ id: string; kind: string; title: string | null; status: string }>> {
  const { data } = await supabase.from('athlete_goals').select('id, kind, title, status').eq('user_id', userId).limit(100);
  return (data ?? []) as Array<{ id: string; kind: string; title: string | null; status: string }>;
}

export async function ownConstraints(userId: string): Promise<Array<{ id: string; kind: string; body_area: string; description: string; status: string }>> {
  const { data } = await supabase.from('athlete_constraints').select('id, kind, body_area, description, status').eq('user_id', userId).limit(100);
  return (data ?? []) as Array<{ id: string; kind: string; body_area: string; description: string; status: string }>;
}

/** Own sessions whose name matches; newest first. */
export async function ownSessionsMatching(userId: string, query: string): Promise<Array<{ id: string; name: string | null; date: string }>> {
  const { data } = await supabase
    .from('workouts')
    .select('id, name, date')
    .eq('user_id', userId)
    .ilike('name', ilikePattern(query))
    .order('date', { ascending: false })
    .limit(8);
  return (data ?? []) as Array<{ id: string; name: string | null; date: string }>;
}

/** Messages of the Coach's own threads whose text matches; newest first. */
export async function coachMessagesMatching(coachId: string, query: string): Promise<Array<{ id: string; client_id: string; body: string; created_at: string }>> {
  const { data } = await supabase
    .from('coach_messages')
    .select('id, client_id, body, created_at')
    .eq('coach_id', coachId)
    .ilike('body', ilikePattern(query))
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as Array<{ id: string; client_id: string; body: string; created_at: string }>;
}
