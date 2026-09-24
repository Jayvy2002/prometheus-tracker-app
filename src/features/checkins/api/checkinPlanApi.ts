import { supabase } from '../../../lib/supabase';
import type { CheckinFrequency, CheckinPlan, CheckinQuestion, CheckinTemplate } from '../domain/checkinTemplate';

export async function listMyTemplates(ownerId: string): Promise<{ templates: CheckinTemplate[]; error: string | null }> {
  const { data, error } = await supabase
    .from('checkin_templates')
    .select('id, owner_id, name, questions, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  return { templates: (data ?? []) as CheckinTemplate[], error: error?.message ?? null };
}

export async function saveTemplate(input: {
  id?: string | null;
  ownerId: string;
  name: string;
  questions: CheckinQuestion[];
}): Promise<{ id: string | null; error: string | null }> {
  const row = { owner_id: input.ownerId, name: input.name.trim(), questions: input.questions, updated_at: new Date().toISOString() };
  const query = input.id
    ? supabase.from('checkin_templates').update(row).eq('id', input.id).select('id').maybeSingle()
    : supabase.from('checkin_templates').insert(row).select('id').maybeSingle();
  const { data, error } = await query;
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null };
}

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('checkin_templates').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** The athlete's plan and its template (the athlete, or their active coach). */
export async function fetchPlan(userId: string): Promise<{ plan: CheckinPlan | null; template: CheckinTemplate | null; error: string | null }> {
  const { data, error } = await supabase.from('checkin_plans').select('*').eq('user_id', userId).maybeSingle();
  if (error) return { plan: null, template: null, error: error.message };
  const plan = (data ?? null) as CheckinPlan | null;
  if (!plan?.template_id) return { plan, template: null, error: null };
  const tpl = await supabase
    .from('checkin_templates')
    .select('id, owner_id, name, questions, updated_at')
    .eq('id', plan.template_id)
    .maybeSingle();
  return { plan, template: (tpl.data ?? null) as CheckinTemplate | null, error: tpl.error?.message ?? null };
}

export async function setPlan(input: {
  userId: string;
  templateId: string | null;
  frequency: CheckinFrequency;
  weekday: number | null;
  habitReasons: Record<string, string>;
}): Promise<{ error: string | null }> {
  const reasons = Object.fromEntries(
    Object.entries(input.habitReasons).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v),
  );
  const { error } = await supabase.rpc('set_checkin_plan', {
    p_user: input.userId,
    p_template: input.templateId,
    p_frequency: input.frequency,
    p_weekday: input.frequency === 'weekly' || input.frequency === 'biweekly' ? input.weekday ?? 1 : null,
    p_habit_reasons: reasons,
  });
  return { error: error?.message ?? null };
}

/** Date of the athlete's latest check-in (null if none). */
export async function fetchLastCheckinDate(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('daily_checkins')
    .select('checked_at')
    .eq('user_id', userId)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { checked_at: string } | null)?.checked_at ?? null;
}
