/**
 * Detects a missing table or PostgREST RPC in the schema cache.
 * P2 métier contracts are in production. Use this only on READ / analysis
 * fallbacks (Watch list, persistAthleteWeeklyReviewCycle). Never fail-open
 * a Solo target mutation: commit_solo_weekly_review_decision is the only
 * write path, and a missing RPC must refuse without mutating anything.
 */

export function isMissingBackendContract(error: {
  message?: string;
  code?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === 'PGRST202'
    || code === 'PGRST205'
    || code === '42P01'
    || /could not find the function|schema cache|does not exist|relation .* does not exist/i.test(message)
  );
}
