import type { AiProgramDayDraft, ProgramExercisePatch } from './types';

/** Payload d'effets pour apply_intervention (D02). */
export interface InterventionEffects {
  calories?: { calories: number; protein: number; carbs: number; fat: number };
  tracking?: {
    track_weight: boolean;
    track_checkins: boolean;
    track_nutrition: boolean;
    track_workouts: boolean;
    workout_focus: string;
    setup_completed_at?: string;
  };
  program?: {
    name: string;
    description: string;
    duration_weeks: number;
    days: AiProgramDayDraft[];
    assign_client_id?: string | null;
    start_date?: string;
  };
  assign_program_id?: string;
  assign_client_id?: string;
  start_date?: string;
  patch?: ProgramExercisePatch & {
    program_id: string;
    fork_if_shared?: boolean;
    for_client_id?: string;
  };
  message?: { body: string; template_key?: string };
  note?: { body: string; note_date?: string };
}

export function effectsToJson(effects: InterventionEffects): Record<string, unknown> {
  return { ...effects };
}
