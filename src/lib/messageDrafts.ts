const DRAFT_PREFIX = 'prometheus.msg-draft.v1:';
const HOME_DISMISS_PREFIX = 'prometheus.home-msg-dismissed.v1:';

export function messageDraftKey(accountId: string, peerId: string): string {
  return `${DRAFT_PREFIX}${accountId}:${peerId}`;
}

export function homeMessageDismissKey(accountId: string, messageId: string): string {
  return `${HOME_DISMISS_PREFIX}${accountId}:${messageId}`;
}

export function loadMessageDraft(
  accountId: string | null | undefined,
  peerId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> = localStorage,
): string {
  if (!accountId || !peerId) return '';
  return storage.getItem(messageDraftKey(accountId, peerId)) ?? '';
}

export function saveMessageDraft(
  accountId: string | null | undefined,
  peerId: string | null | undefined,
  body: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): void {
  if (!accountId || !peerId) return;
  const key = messageDraftKey(accountId, peerId);
  if (!body.trim()) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, body);
}

export function clearMessageDraft(
  accountId: string | null | undefined,
  peerId: string | null | undefined,
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  if (!accountId || !peerId) return;
  storage.removeItem(messageDraftKey(accountId, peerId));
}

/** A personal draft always wins over a prefilled relance. */
export function composeThreadBody(personalDraft: string, nudge?: string): string {
  if (personalDraft.trim()) return personalDraft;
  return nudge ?? '';
}

export function isHomeMessageDismissed(
  accountId: string | null | undefined,
  messageId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): boolean {
  if (!accountId || !messageId) return false;
  return storage.getItem(homeMessageDismissKey(accountId, messageId)) === '1';
}

export function dismissHomeMessage(
  accountId: string | null | undefined,
  messageId: string | null | undefined,
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  if (!accountId || !messageId) return;
  storage.setItem(homeMessageDismissKey(accountId, messageId), '1');
}

export function confirmedReadIds(rows: Array<{ id?: string } | null> | null | undefined): string[] {
  return (rows ?? []).map(row => row?.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
}
