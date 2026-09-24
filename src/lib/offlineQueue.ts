import { getSessionOwner } from './sessionScope';

export type OfflineOpType =
  | 'workout.create'
  | 'workout.startTemplate'
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
  | 'superset.unlink'
  | 'constraint.declare';

export type OfflineOpStatus = 'pending' | 'dead';

export interface OfflineOp {
  /** Client-stable id — also sent as client_op_id for idempotent creates. */
  id: string;
  accountId: string;
  type: OfflineOpType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  status: OfflineOpStatus;
}

export type EnqueueResult =
  | { ok: true; op: OfflineOp }
  | { ok: false; error: 'no_account' | 'quota' };

interface OfflineStore {
  version: 2;
  ops: OfflineOp[];
  /** D07 : correspondance temp ID → id serveur, persistée entre drains. */
  idMap: Record<string, string>;
}

const PREFIX = 'prometheus_offline_queue';

function queueKey(accountId: string): string {
  return `${PREFIX}_${accountId}`;
}

function emptyStore(): OfflineStore {
  return { version: 2, ops: [], idMap: {} };
}

function normalizeOp(raw: unknown): OfflineOp | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.type !== 'string') return null;
  return {
    id: row.id,
    accountId: typeof row.accountId === 'string' ? row.accountId : '',
    type: row.type as OfflineOpType,
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : {},
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    lastError: typeof row.lastError === 'string' ? row.lastError : null,
    status: row.status === 'dead' ? 'dead' : 'pending',
  };
}

function readStore(accountId: string): OfflineStore {
  try {
    const raw = localStorage.getItem(queueKey(accountId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        version: 2,
        ops: parsed.map(normalizeOp).filter((op): op is OfflineOp => !!op),
        idMap: {},
      };
    }
    if (parsed && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>;
      const ops = Array.isArray(row.ops)
        ? row.ops.map(normalizeOp).filter((op): op is OfflineOp => !!op)
        : [];
      const idMap = row.idMap && typeof row.idMap === 'object' && !Array.isArray(row.idMap)
        ? Object.fromEntries(
          Object.entries(row.idMap as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
        : {};
      return { version: 2, ops, idMap };
    }
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

function writeStore(accountId: string, store: OfflineStore): 'ok' | 'quota' {
  const payload = JSON.stringify({ version: 2, ops: store.ops, idMap: store.idMap });
  try {
    localStorage.setItem(queueKey(accountId), payload);
    return 'ok';
  } catch (err) {
    const quota = err instanceof DOMException
      || (err instanceof Error && /quota|storage/i.test(err.name + err.message));
    if (quota) return 'quota';
    return 'quota';
  }
}

function newOpId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** D07 : file durable par compte. Jamais mélangée, jamais tronquée. */
export function enqueueOfflineOp(
  type: OfflineOpType,
  payload: Record<string, unknown>,
  accountId: string | null = getSessionOwner(),
): EnqueueResult {
  if (!accountId) return { ok: false, error: 'no_account' };
  const op: OfflineOp = {
    id: newOpId(),
    accountId,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: 'pending',
  };
  const store = readStore(accountId);
  store.ops.push(op);
  const written = writeStore(accountId, store);
  if (written === 'quota') {
    return { ok: false, error: 'quota' };
  }
  return { ok: true, op };
}

export function peekOfflineOps(accountId: string | null = getSessionOwner()): OfflineOp[] {
  if (!accountId) return [];
  return readStore(accountId).ops.filter(op => op.status !== 'dead');
}

export function peekDeadLetterOps(accountId: string | null = getSessionOwner()): OfflineOp[] {
  if (!accountId) return [];
  return readStore(accountId).ops.filter(op => op.status === 'dead');
}

export function peekAllOfflineOps(accountId: string | null = getSessionOwner()): OfflineOp[] {
  if (!accountId) return [];
  return readStore(accountId).ops;
}

export function removeOfflineOp(opId: string, accountId: string | null = getSessionOwner()): void {
  if (!accountId) return;
  const store = readStore(accountId);
  store.ops = store.ops.filter(op => op.id !== opId);
  writeStore(accountId, store);
}

export function markOfflineOpFailed(
  opId: string,
  message: string,
  accountId: string | null = getSessionOwner(),
): void {
  if (!accountId) return;
  const store = readStore(accountId);
  store.ops = store.ops.map(op => (op.id === opId
    ? { ...op, attempts: op.attempts + 1, lastError: message }
    : op));
  writeStore(accountId, store);
}

/** Après 3 échecs applicatifs : dead-letter visible, jamais supprimée. */
export function moveOfflineOpToDeadLetter(
  opId: string,
  message: string,
  accountId: string | null = getSessionOwner(),
): void {
  if (!accountId) return;
  const store = readStore(accountId);
  store.ops = store.ops.map(op => (op.id === opId
    ? { ...op, attempts: op.attempts + 1, lastError: message, status: 'dead' as const }
    : op));
  writeStore(accountId, store);
}

export function retryDeadLetterOp(
  opId: string,
  accountId: string | null = getSessionOwner(),
): void {
  if (!accountId) return;
  const store = readStore(accountId);
  store.ops = store.ops.map(op => (op.id === opId
    ? { ...op, status: 'pending' as const, lastError: null }
    : op));
  writeStore(accountId, store);
}

export function loadIdMap(accountId: string | null = getSessionOwner()): Map<string, string> {
  if (!accountId) return new Map();
  return new Map(Object.entries(readStore(accountId).idMap));
}

export function persistIdMap(
  idMap: Map<string, string>,
  accountId: string | null = getSessionOwner(),
): 'ok' | 'quota' {
  if (!accountId) return 'ok';
  const store = readStore(accountId);
  store.idMap = Object.fromEntries(idMap);
  return writeStore(accountId, store);
}

export function clearOfflineQueue(accountId: string): void {
  try {
    localStorage.removeItem(queueKey(accountId));
  } catch { /* ignore */ }
}

export function isTransportError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|timeout|temporarily unavailable|econnreset|enotfound|offline/i.test(message);
}

export function isQuotaError(error: unknown): boolean {
  return error === 'quota'
    || (error instanceof Error && /quota/i.test(error.message));
}

const OFFLINE_OP_KEYS: Record<OfflineOpType, string> = {
  'workout.create': 'workout.offlineOp.create',
  'workout.startTemplate': 'workout.offlineOp.startTemplate',
  'constraint.declare': 'workout.offlineOp.constraintDeclare',
  'workout.update': 'workout.offlineOp.update',
  'workout.delete': 'workout.offlineOp.delete',
  'exercise.add': 'workout.offlineOp.exerciseAdd',
  'exercise.update': 'workout.offlineOp.exerciseUpdate',
  'exercise.delete': 'workout.offlineOp.exerciseDelete',
  'exercise.restore': 'workout.offlineOp.exerciseRestore',
  'set.add': 'workout.offlineOp.setAdd',
  'set.update': 'workout.offlineOp.setUpdate',
  'set.delete': 'workout.offlineOp.setDelete',
  'set.restore': 'workout.offlineOp.setRestore',
  'superset.link': 'workout.offlineOp.supersetLink',
  'superset.unlink': 'workout.offlineOp.supersetUnlink',
};

/** i18n key for a queued mutation — never show `set.add` to the athlete. */
export function offlineOpLabelKey(type: string): string {
  return OFFLINE_OP_KEYS[type as OfflineOpType] ?? 'workout.offlineOp.generic';
}
