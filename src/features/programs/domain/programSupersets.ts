import type { ProgramExerciseDraft } from '../types';

/**
 * Supersets in the program editor. The stored value is unchanged: exercises
 * sharing the same `superset_group` text (« A », « B »… or anything typed by
 * hand before) are one superset in the logger. The editor only offers
 * « enchaîner avec l'exercice suivant » and writes those same values; a group
 * typed by hand is kept as is until the coach changes it.
 */

type SupersetExercise = Pick<ProgramExerciseDraft, 'superset_group'>;

export function supersetGroupOf(ex: SupersetExercise | undefined | null): string {
  return (ex?.superset_group ?? '').trim();
}

export function isLinkedToNext(exercises: readonly SupersetExercise[], index: number): boolean {
  const here = supersetGroupOf(exercises[index]);
  return !!here && index + 1 < exercises.length && here === supersetGroupOf(exercises[index + 1]);
}

export function isLinkedToPrevious(exercises: readonly SupersetExercise[], index: number): boolean {
  return index > 0 && isLinkedToNext(exercises, index - 1);
}

/** Other exercises of the same group, wherever they are in the session. */
export function supersetPartners(exercises: readonly SupersetExercise[], index: number): number[] {
  const group = supersetGroupOf(exercises[index]);
  if (!group) return [];
  return exercises
    .map((ex, i) => (i !== index && supersetGroupOf(ex) === group ? i : -1))
    .filter(i => i >= 0);
}

/** First letter A–Z not used in this session, then S1, S2… */
export function nextFreeSupersetGroup(exercises: readonly SupersetExercise[]): string {
  const used = new Set(exercises.map(ex => supersetGroupOf(ex).toUpperCase()).filter(Boolean));
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  let n = 1;
  while (used.has(`S${n}`)) n += 1;
  return `S${n}`;
}

function withGroup<T extends SupersetExercise>(ex: T, group: string | null): T {
  return { ...ex, superset_group: group };
}

/**
 * Chain exercise `index` with the next one. An exercise already in a group
 * brings the other into it; two different groups become one (the whole
 * second group joins the first, as the logger would show them together).
 */
export function linkWithNext<T extends SupersetExercise>(exercises: readonly T[], index: number): T[] {
  if (index < 0 || index + 1 >= exercises.length) return [...exercises];
  const here = supersetGroupOf(exercises[index]);
  const next = supersetGroupOf(exercises[index + 1]);
  if (here && here === next) return [...exercises];
  if (here && next) {
    return exercises.map(ex => (supersetGroupOf(ex) === next ? withGroup(ex, here) : ex));
  }
  const group = here || next || nextFreeSupersetGroup(exercises);
  return exercises.map((ex, i) => (i === index || i === index + 1 ? withGroup(ex, group) : ex));
}

/**
 * Break the chain between `index` and the next exercise. Each side keeps a
 * group only if it still has two exercises (or partners elsewhere); the part
 * after the break gets a new letter. A group of one is cleared.
 */
export function unlinkFromNext<T extends SupersetExercise>(exercises: readonly T[], index: number): T[] {
  if (!isLinkedToNext(exercises, index)) return [...exercises];
  const group = supersetGroupOf(exercises[index]);
  let start = index;
  while (start > 0 && supersetGroupOf(exercises[start - 1]) === group) start -= 1;
  let end = index + 1;
  while (end + 1 < exercises.length && supersetGroupOf(exercises[end + 1]) === group) end += 1;

  const head = { from: start, to: index };
  const tail = { from: index + 1, to: end };
  const outsideRun = exercises.some((ex, i) => (i < start || i > end) && supersetGroupOf(ex) === group);
  const headSize = head.to - head.from + 1;
  const tailSize = tail.to - tail.from + 1;
  const headGroup = headSize >= 2 || outsideRun ? group : null;
  const remaining = exercises.map((ex, i) => (i >= tail.from && i <= tail.to ? withGroup(ex, null) : ex));
  const tailGroup = tailSize >= 2 ? nextFreeSupersetGroup(remaining) : null;

  return exercises.map((ex, i) => {
    if (i >= head.from && i <= head.to) return headGroup === group ? ex : withGroup(ex, headGroup);
    if (i >= tail.from && i <= tail.to) return withGroup(ex, tailGroup);
    return ex;
  });
}

/** Take one exercise out of its group (the others keep theirs). */
export function removeFromSuperset<T extends SupersetExercise>(exercises: readonly T[], index: number): T[] {
  return exercises.map((ex, i) => (i === index ? withGroup(ex, null) : ex));
}
