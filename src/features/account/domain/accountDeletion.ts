/**
 * Vision §30 — a requested deletion is pending during the recovery window,
 * then purged by the server. Mirrors account_deletion_requests.status.
 */
export type AccountDeletionStatus = 'none' | 'pending' | 'purging' | 'cancelled' | 'failed';

/** Same value as account_deletion_window() — shown to the person, never used to decide. */
export const ACCOUNT_DELETION_WINDOW_DAYS = 14;

export interface AccountDeletionState {
  status: AccountDeletionStatus;
  purgeAfter: string | null;
}

export function parseAccountDeletion(row: { status?: unknown; purge_after?: unknown } | null | undefined): AccountDeletionState {
  const status = row?.status;
  const known: AccountDeletionStatus[] = ['pending', 'purging', 'cancelled', 'failed'];
  return {
    status: typeof status === 'string' && (known as string[]).includes(status) ? status as AccountDeletionStatus : 'none',
    purgeAfter: typeof row?.purge_after === 'string' ? row.purge_after : null,
  };
}

/** While a deletion is under way the app shows only the recovery screen. */
export function blocksApp(state: AccountDeletionState): boolean {
  return state.status === 'pending' || state.status === 'purging' || state.status === 'failed';
}

export function canCancel(state: AccountDeletionState): boolean {
  return state.status === 'pending' || state.status === 'failed';
}

/** Whole days left, rounded up; 0 on the due day. */
export function daysLeft(purgeAfter: string | null, now: Date = new Date()): number | null {
  if (!purgeAfter) return null;
  const due = new Date(purgeAfter).getTime();
  if (Number.isNaN(due)) return null;
  return Math.max(0, Math.ceil((due - now.getTime()) / 86_400_000));
}
