/** Fill empty gym-floor fields from last / suggested placeholders when the athlete checks the set. */
export function applySetPlaceholders(input: {
  weight: string;
  reps: string;
  duration: string;
  isIsometric: boolean;
  showLoad: boolean;
  showReps: boolean;
  weightPlaceholder: string;
  repsPlaceholder: string;
}): { weight: string; reps: string; duration: string } {
  const usable = (value: string) => value !== '' && value !== '0';
  return {
    weight: input.showLoad && !usable(input.weight) && usable(input.weightPlaceholder)
      ? input.weightPlaceholder
      : input.weight,
    reps: !input.isIsometric && input.showReps && !usable(input.reps) && usable(input.repsPlaceholder)
      ? input.repsPlaceholder
      : input.reps,
    duration: input.duration,
  };
}
