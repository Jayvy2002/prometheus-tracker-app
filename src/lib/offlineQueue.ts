import { getSessionOwner } from './sessionScope';

export type OfflineOpType =
  | 'workout.create'
  | 'workout.update'
  | 'workout.delete'
  | 'exercise.add'
  | 'exercise.update'
  | 'exercise.delete'
  | 'exercise.restore'
  | 'set.add'
  | 'set.update'
  | 'set.delete'
  | 'set.restore'
  | 'superset.link'
  | 'superset.unlink';

export interface OfflineOp {
  /** Client-stable id — also sent as client_op_id for idempotent creates. */
  id: string;
  accountId: string;
  type: OfflineOpType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

const PREFIX = 'prometheus_offline_queue';
const MAX_OPS = 200;

function queueKey(accountId: string): string {
  return `${PREFIX}_${accountId}`;
}

function readQueue(accountId: string): OfflineOp[] {
  try {
    const raw = localStorage.getItem(queueKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OfflineOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(accountId: string, ops: OfflineOp[]): void {
  try {
    localStorage.setItem(queueKey(accountId), JSON.stringify(ops.slice(-MAX_OPS)));
  } catch {
    // quota — keep the in-memory copy only
  }
}

/** D07 : file durable par compte. Jamais mélangée entre comptes. */
export function enqueueOfflineOp(
  type: OfflineOpType,
  payload: Record<string, unknown>,
  accountId: string | null = getSessionOwner(),
): OfflineOp | null {
  if (!accountId) return null;
  const op: OfflineOp = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    accountId,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const ops = readQueue(accountId);
  ops.push(op);
  writeQueue(accountId, ops);
  return op;
}

export function peekOfflineOps(accountId: string | null = getSessionOwner()): OfflineOp[] {
  if (!accountId) return [];
  return readQueue(accountId);
}

export function removeOfflineOp(opId: string, accountId: string | null = getSessionOwner()): void {
  if (!accountId) return;
  writeQueue(
    accountId,
    readQueue(accountId).filter(op => op.id !== opId),
  );
}

export function markOfflineOpFailed(
  opId: string,
  message: string,
  accountId: string | null = getSessionOwner(),
): void {
  if (!accountId) return;
  writeQueue(
    accountId,
    readQueue(accountId).map(op => (op.id === opId
      ? { ...op, attempts: op.attempts + 1, lastError: message }
      : op)),
  );
}

/** Purge la file d'un compte (logout). */
export function clearOfflineQueue(accountId: string): void {
  try {
    localStorage.removeItem(queueKey(accountId));
  } catch { /* ignore */ }
}

/** True when the failure looks like transport (offline/DNS/reset), not app logic. */
export function isTransportError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|timeout|temporarily unavailable|econnreset|enotfound|offline/i.test(message);
}
