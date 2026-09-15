import { isPerformedSet } from '../../../lib/performedSets';
import type { ExerciseSession } from '../../../stores/workoutStore';

export type OverloadSuggestionKind =
  | 'stagnant'
  | 'push_harder'
  | 'keep_progressing'
  | 'progressing'
  | 'below_last'
  | 'add_weight'
  | 'add_rep';

interface OverloadResult {
  kind: OverloadSuggestionKind;
  /** Poids suggéré en kg (canonique) — l'affichage convertit selon l'unité. */
  suggestedWeight: number | null;
  reps: number | null;
  confidence: 'low' | 'medium' | 'high';
}

/** Q03 : la suggestion est structurée — le texte est localisé au rendu, jamais codé en dur. */
export function getOverloadSuggestion(history: ExerciseSession[]): OverloadResult | null {
  const sessions = history
    .map(h => ({
      date: h.date,
      workingSets: h.sets.filter(s => isPerformedSet(s) && s.weight_kg > 0 && s.reps > 0),
    }))
    .filter(s => s.workingSets.length > 0);

  if (sessions.length === 0) return null;

  const latest = sessions[0];
  const avgRirLatest = latest.workingSets.reduce((sum, s) => sum + s.rir, 0) / latest.workingSets.length;
  const maxWeightLatest = Math.max(...latest.workingSets.map(s => s.weight_kg));
  const lastSet = latest.workingSets[latest.workingSets.length - 1];

  const roundTo125 = (w: number) => Math.ceil(w / 1.25) * 1.25;

  if (sessions.length >= 3) {
    const maxWeights = sessions.slice(0, 3).map(s => Math.max(...s.workingSets.map(set => set.weight_kg)));
    const [w0, w1, w2] = maxWeights;

    if (w0 === w1 && w1 === w2) {
      const avgRirAll = sessions.slice(0, 3).flatMap(s => s.workingSets).reduce((sum, s) => sum + s.rir, 0) /
        sessions.slice(0, 3).flatMap(s => s.workingSets).length;

      if (avgRirAll <= 2) {
        const suggested = roundTo125(w0 * 1.025);
        return { kind: 'stagnant', suggestedWeight: suggested, reps: null, confidence: 'high' };
      }
      return { kind: 'push_harder', suggestedWeight: null, reps: null, confidence: 'low' };
    }

    if (w0 > w1 && w1 >= w2 && avgRirLatest <= 2) {
      const increment = w0 - w1;
      const suggested = roundTo125(w0 + increment);
      return { kind: 'keep_progressing', suggestedWeight: suggested, reps: null, confidence: 'high' };
    }
  }

  if (sessions.length >= 2) {
    const maxWeightPrev = Math.max(...sessions[1].workingSets.map(s => s.weight_kg));

    if (maxWeightLatest > maxWeightPrev && avgRirLatest <= 2) {
      const suggested = roundTo125(maxWeightLatest * 1.025);
      return { kind: 'progressing', suggestedWeight: suggested, reps: null, confidence: 'medium' };
    }

    if (maxWeightLatest < maxWeightPrev) {
      return { kind: 'below_last', suggestedWeight: maxWeightPrev, reps: null, confidence: 'low' };
    }
  }

  if (avgRirLatest <= 1) {
    const suggested = roundTo125(lastSet.weight_kg * 1.025);
    return { kind: 'add_weight', suggestedWeight: suggested, reps: lastSet.reps, confidence: 'medium' };
  }
  if (avgRirLatest <= 2) {
    return { kind: 'add_rep', suggestedWeight: lastSet.weight_kg, reps: lastSet.reps + 1, confidence: 'low' };
  }

  return null;
}

export const SUGGESTION_KEY: Record<OverloadSuggestionKind, string> = {
  stagnant: 'workout.exerciseCard.suggestStagnant',
  push_harder: 'workout.exerciseCard.suggestPushHarder',
  keep_progressing: 'workout.exerciseCard.suggestKeepProgressing',
  progressing: 'workout.exerciseCard.suggestProgressing',
  below_last: 'workout.exerciseCard.suggestBelowLast',
  add_weight: 'workout.exerciseCard.suggestAddWeight',
  add_rep: 'workout.exerciseCard.suggestAddRep',
};
