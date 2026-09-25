import type { Workout } from '../types';

/**
 * A session started from a program carries its provenance (assignment, day,
 * phase, revision). The database lets only the start RPC write it, so a client
 * re-insert could not bring it back: such a session is deleted after an
 * explicit confirmation, never with an « undo » that would fail or restore a
 * different session (the history is never silently rewritten).
 */
export function canUndoWorkoutDelete(workout: Pick<Workout,
  'program_assignment_id' | 'program_day_id' | 'program_phase_id' | 'program_id' | 'program_revision_no' | 'prescribed_phase_name'>): boolean {
  return !workout.program_assignment_id
    && !workout.program_day_id
    && !workout.program_phase_id
    && !workout.program_id
    && workout.program_revision_no == null
    && !workout.prescribed_phase_name;
}
