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
