const PREFIX = 'prometheus.grocery.v1:';

export function groceryListKey(accountId: string): string {
  return `${PREFIX}${accountId}`;
}

export function loadGroceryList(
  accountId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> = localStorage,
): string[] {
  if (!accountId) return [];
  try {
    const raw = storage.getItem(groceryListKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveGroceryList(
  accountId: string | null | undefined,
  items: string[],
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (!accountId) return;
  const key = groceryListKey(accountId);
  const clean = items.map(s => s.trim()).filter(Boolean);
  if (clean.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(clean));
}
