import {
  supabase,
} from '../../../lib/supabase';
import {
  mapInterventionRow,
} from '../../../lib/coachInterventions';
import {
  CoachingState,
} from './coachingShared';

export function createQuestionnairesSlice(): Pick<CoachingState, 'fetchOnboardingPlanDraft'> {
  return {
  fetchOnboardingPlanDraft: async (clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('client_id', clientId)
      .eq('kind', 'onboarding_plan')
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },
  };
}
