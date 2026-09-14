export interface FinishSetLike {
  id: string;
  set_type?: string | null;
  completed?: boolean | null;
}

export interface FinishExerciseLike {
  id: string;
  sets?: FinishSetLike[] | null;
}

export function workingSets(exercises: FinishExerciseLike[] | null | undefined): FinishSetLike[] {
  return (exercises ?? []).flatMap(ex => (ex.sets ?? []).filter(s => s.set_type !== 'warmup'));
}

/** Sets that were not marked done by the athlete. Warm-ups never count. */
export function incompleteWorkingSets(exercises: FinishExerciseLike[] | null | undefined): FinishSetLike[] {
  return workingSets(exercises).filter(s => !s.completed);
}

export function shouldConfirmIncompleteFinish(exercises: FinishExerciseLike[] | null | undefined): boolean {
  return incompleteWorkingSets(exercises).length > 0;
}
