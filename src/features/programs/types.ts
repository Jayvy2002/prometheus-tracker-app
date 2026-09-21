/** Contrats programme / attribution / brouillons de plan — lot 22a. */
import type { SetType } from '../../shared/types';
import type { SessionOrganization } from './domain/sessionOrganization';
import type { ProgramPhase } from './domain/programPhases';

export type { SessionOrganization, ProgramPhase };
export type { ProgramPhaseDraft } from './domain/programPhases';

export interface ProgramExerciseDraft {
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  set_type?: SetType;
  superset_group?: string | null;
  drop_count?: number | null;
  tempo?: string | null;
  isometric_seconds?: number | null;
  cluster_rest_seconds?: number | null;
  cluster_reps_per_burst?: number | null;
  myo_activation?: boolean;
}

export interface AiProgramDayDraft {
  id?: string;
  weekday: number | null;
  name: string;
  phase_id?: string | null;
  exercises: ProgramExerciseDraft[];
}

export interface ProgramExercisePatch {
  exercise: string;
  /** I02 : résolution exacte — prioritaire sur le nom dès qu'elle est renseignée. */
  exercise_id?: string | null;
  program_day_id?: string | null;
  weekday?: number | null;
  default_sets?: number;
  default_reps?: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  replace_with?: string;
}

export interface AiPlanDraft {
  program: {
    name: string;
    description: string;
    duration_weeks: number;
    days: AiProgramDayDraft[];
  };
  tracking: {
    track_weight: boolean;
    track_checkins: boolean;
    track_nutrition: boolean;
    track_workouts: boolean;
    workout_focus: string;
    training_vars?: Record<string, boolean>;
    nutrition_vars?: Record<string, boolean>;
    checkin_vars?: Record<string, boolean>;
  };
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    rationale: string;
  };
  recipes?: string[];
}

export interface Program {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  duration_weeks: number;
  session_organization?: SessionOrganization;
  phases?: ProgramPhase[];
  days?: ProgramDay[];
  active_revision_no?: number | null;
  scheduled_revision_no?: number | null;
  scheduled_activates_on?: string | null;
  scheduled_activation_timezone?: string | null;
  phase_anchor_on?: string | null;
  scheduled_snapshot?: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramDay {
  id: string;
  program_id: string;
  weekday: number | null;
  name: string;
  routine_id: string | null;
  order_index: number;
  phase_id?: string | null;
  exercises?: ProgramDayExercise[];
  created_at: string;
}

export interface ProgramDayExercise {
  id: string;
  program_day_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds: number;
  default_weight_kg?: number | null;
  set_type?: SetType;
  superset_group?: string | null;
  drop_count?: number | null;
  tempo?: string | null;
  isometric_seconds?: number | null;
  cluster_rest_seconds?: number | null;
  cluster_reps_per_burst?: number | null;
  myo_activation?: boolean;
  order_index: number;
  created_at: string;
}

export interface ProgramAssignment {
  id: string;
  program_id: string;
  client_id: string;
  assigned_by: string;
  start_date: string;
  status: 'active' | 'completed' | 'paused';
  frozen_revision_no?: number | null;
  program?: Program;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateExercise {
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  set_type?: SetType;
  superset_group?: string | null;
  drop_count?: number | null;
  drop_segments?: Array<{ weight_kg: number; reps: number }>;
  tempo?: string | null;
  isometric_seconds?: number | null;
  cluster_rest_seconds?: number | null;
  cluster_reps_per_burst?: number | null;
  myo_activation?: boolean;
  order_index: number;
}
