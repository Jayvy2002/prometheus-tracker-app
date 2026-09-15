/** Remaining whole seconds for a countdown that ends at `endAtMs`. */
export function countdownRemaining(endAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endAtMs - nowMs) / 1000));
}

export function countdownEndAt(remainingSec: number, nowMs: number): number {
  return nowMs + Math.max(0, remainingSec) * 1000;
}

/** Preferred rest length after marking a set done. Undefined → keep the last timer duration. */
export function resolveRestSeconds(prescribed?: number | null): number | undefined {
  if (typeof prescribed === 'number' && prescribed > 0) return prescribed;
  return undefined;
}

/** Auto rest starts only after a completed set — never after a placeholder fill. */
export function shouldAutoStartRest(input: {
  preferenceOn: boolean;
  restModuleOn: boolean;
  afterCompletedSet: boolean;
  restAfterThisSet: boolean;
}): boolean {
  return input.preferenceOn && input.restModuleOn && input.afterCompletedSet && input.restAfterThisSet;
}
