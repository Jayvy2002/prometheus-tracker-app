/** P2.4 Vision 8.5 — traceable watch-context correction. No source-data rewrite. */

export const WATCH_CONTEXT_CORRECTION_KIND = 'watch_context_correction' as const;

export const WATCH_CONTEXT_CORRECTION_ACTIONS = ['not_relevant', 'corrected'] as const;

export type WatchContextCorrectionAction = (typeof WATCH_CONTEXT_CORRECTION_ACTIONS)[number];

export const WATCH_CONTEXT_CORRECTION_DECISION = 'corrected' as const;

export const WATCH_CONTEXT_CORRECTION_SOURCE = 'prometheus_watch' as const;

export function isWatchContextCorrectionAction(
  value: string,
): value is WatchContextCorrectionAction {
  return (WATCH_CONTEXT_CORRECTION_ACTIONS as readonly string[]).includes(value);
}

export function watchContextCorrectionIdempotencyKey(
  signalId: string,
  action: WatchContextCorrectionAction,
): string {
  return `watch-correct:${signalId}:${action}`.slice(0, 200);
}
