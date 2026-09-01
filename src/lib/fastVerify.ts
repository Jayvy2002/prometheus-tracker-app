/**
 * Fast food / exercise verification contract.
 *
 * Lookup order is local DB first. OpenAI runs only on a miss, inside the
 * edge function, and the function writes the result before returning 200.
 * These paths never ping Second (GROK_BOT_WEBHOOK_URL).
 *
 * Coach drafts (onboarding_plan, ask_prometheus, program_nl_edit) stay on
 * coach-agent (sync OpenAI). Fleet rounds stay in-app.
 */

export const FAST_VERIFY_VENDOR = 'openai' as const;

/** Bonus Realtime wait if a stale deploy still returns 202. Primary path is 200. */
export const FAST_VERIFY_BONUS_POLL_MS = 2_000;
export const FAST_VERIFY_BONUS_TIMEOUT_MS = 8_000;

export function shouldCallAnalyzeProductApi(hits: {
  dbHit: boolean;
  offHit: boolean;
}): boolean {
  return !hits.dbHit && !hits.offHit;
}

export function shouldCallVerifyExerciseApi(hits: { libraryHit: boolean }): boolean {
  return !hits.libraryHit;
}

export function foodLookupSource(hits: {
  dbHit: boolean;
  offHit: boolean;
}): 'food_products' | 'open_food_facts' | 'analyze_product' {
  if (hits.dbHit) return 'food_products';
  if (hits.offHit) return 'open_food_facts';
  return 'analyze_product';
}

export function completedProductWrite(productId: string): {
  status: 'completed';
  result_product_id: string;
} {
  return { status: 'completed', result_product_id: productId };
}

export function completedExerciseWrite(exerciseId: string, approved: boolean): {
  status: 'approved' | 'rejected';
  result_exercise_id: string | null;
} {
  return {
    status: approved ? 'approved' : 'rejected',
    result_exercise_id: approved ? exerciseId : null,
  };
}

export type AnalyzeClientOutcome =
  | { kind: 'ready'; product: Record<string, unknown>; confidence: number }
  | { kind: 'poll' }
  | { kind: 'error'; key: string };

export function parseAnalyzeProductResponse(
  body: Record<string, unknown>,
  httpStatus: number,
): AnalyzeClientOutcome {
  const errCode = typeof body.error === 'string' ? body.error : '';
  if (errCode === 'DAILY_LIMIT_REACHED' || httpStatus === 429) {
    return { kind: 'error', key: 'scanner.dailyLimitReached' };
  }
  const product = body.product;
  if (product && typeof product === 'object' && !Array.isArray(product)) {
    return {
      kind: 'ready',
      product: product as Record<string, unknown>,
      confidence: typeof body.confidence === 'number' ? body.confidence : 100,
    };
  }
  if (body.status === 'processing' || httpStatus === 202) {
    return { kind: 'poll' };
  }
  if (body.status === 'failed' || errCode) {
    return { kind: 'error', key: 'scanner.aiFailed' };
  }
  return { kind: 'error', key: 'scanner.aiStartError' };
}

export type VerifyClientOutcome =
  | { kind: 'approved'; exercise: Record<string, unknown> }
  | { kind: 'rejected'; reason: string }
  | { kind: 'poll' }
  | { kind: 'error'; dailyLimit: boolean };

export function parseVerifyExerciseResponse(
  body: Record<string, unknown>,
  httpStatus: number,
): VerifyClientOutcome {
  const errCode = typeof body.error === 'string' ? body.error : '';
  if (errCode === 'DAILY_LIMIT_REACHED' || httpStatus === 429) {
    return { kind: 'error', dailyLimit: true };
  }
  const exercise = body.exercise;
  if (exercise && typeof exercise === 'object' && !Array.isArray(exercise)) {
    return { kind: 'approved', exercise: exercise as Record<string, unknown> };
  }
  if (body.rejected === true) {
    return {
      kind: 'rejected',
      reason: typeof body.reason === 'string' ? body.reason : '',
    };
  }
  if (body.status === 'processing' || httpStatus === 202) {
    return { kind: 'poll' };
  }
  return { kind: 'error', dailyLimit: false };
}

/** Food + exercise never share Second's webhook kinds. */
export function isSecondFoodOrExerciseKind(kind: string): boolean {
  return kind === 'analyze_product' || kind === 'verify_exercise' || kind === 'batch_verify_exercises';
}
