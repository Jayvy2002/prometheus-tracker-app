import type { ResolvedTrackingConfig } from './clientTracking';

export const SETUP_WIZARD_STEPS = ['understand', 'tracking', 'care', 'review'] as const;
export type SetupWizardStep = typeof SETUP_WIZARD_STEPS[number];

export function trackingModulesOn(tracking: ResolvedTrackingConfig): Array<'workouts' | 'checkins' | 'nutrition' | 'weight'> {
  const keys: Array<'workouts' | 'checkins' | 'nutrition' | 'weight'> = [];
  if (tracking.track_workouts) keys.push('workouts');
  if (tracking.track_checkins) keys.push('checkins');
  if (tracking.track_nutrition) keys.push('nutrition');
  if (tracking.track_weight) keys.push('weight');
  return keys;
}

export function setupProgramLabel(args: {
  assignedName?: string;
  draftName?: string;
  draftDayCount: number;
}): string | null {
  if (args.assignedName?.trim()) return args.assignedName.trim();
  if (args.draftName?.trim() && args.draftDayCount > 0) return args.draftName.trim();
  return null;
}
