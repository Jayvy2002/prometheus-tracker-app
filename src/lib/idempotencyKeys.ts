import { getSessionOwner } from './sessionScope';

const PREFIX = 'prometheus_idempotency';

export interface InterventionKeys {
  claimKey: string;
  idempotencyKey: string;
  clientMsgId: string;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function keyFor(kind: string, id: string, accountId: string | null): string {
  return `${PREFIX}_${accountId ?? 'anon'}_${kind}_${id}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** D02 : clés stables entre retries, reload et crash. */
export function loadOrCreateInterventionKeys(
  interventionId: string,
  accountId: string | null = getSessionOwner(),
): InterventionKeys {
  const key = keyFor('intervention', interventionId, accountId);
  const existing = readJson<InterventionKeys>(key);
  if (existing?.claimKey && existing.idempotencyKey && existing.clientMsgId) {
    return existing;
  }
  const created: InterventionKeys = {
    claimKey: existing?.claimKey ?? newId(),
    idempotencyKey: existing?.idempotencyKey ?? newId(),
    clientMsgId: existing?.clientMsgId ?? newId(),
  };
  writeJson(key, created);
  return created;
}

export function clearInterventionKeys(
  interventionId: string,
  accountId: string | null = getSessionOwner(),
): void {
  try {
    localStorage.removeItem(keyFor('intervention', interventionId, accountId));
  } catch { /* ignore */ }
}

/** C02/D02 : même client_msg_id tant que le corps n'a pas changé. */
export function loadOrCreateMessageKey(
  threadId: string,
  body: string,
  accountId: string | null = getSessionOwner(),
): string {
  const key = keyFor('message', threadId, accountId);
  const existing = readJson<{ clientMsgId: string; body: string }>(key);
  const trimmed = body.trim();
  if (existing?.clientMsgId && existing.body === trimmed) return existing.clientMsgId;
  const clientMsgId = newId();
  writeJson(key, { clientMsgId, body: trimmed });
  return clientMsgId;
}

export function clearMessageKey(
  threadId: string,
  accountId: string | null = getSessionOwner(),
): void {
  try {
    localStorage.removeItem(keyFor('message', threadId, accountId));
  } catch { /* ignore */ }
}
