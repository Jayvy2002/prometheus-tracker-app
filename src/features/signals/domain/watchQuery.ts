/** Watch-panel reads: unavailable must not look like an empty dossier. */

export type WatchQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
