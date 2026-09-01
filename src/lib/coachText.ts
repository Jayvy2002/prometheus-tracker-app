/** Accent-fold + lowercase so FR/EN lift names match. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const left = foldText(a);
  const right = foldText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

/** True when a person's name tokens appear in a free-text question (not only substring of the whole sentence). */
export function nameAppearsIn(query: string, name: string | null | undefined): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  if (namesMatch(n, query)) return true;
  const qTokens = new Set(foldText(query).split(/\s+/).filter(t => t.length >= 3));
  return foldText(n).split(/\s+/).filter(t => t.length >= 3).some(tok => qTokens.has(tok));
}

export function displayName(client: { full_name?: string | null; email?: string | null }, unnamed = '—'): string {
  return (client.full_name || client.email || unnamed).trim() || unnamed;
}

export function datePrefix(value: string): string {
  return value.slice(0, 10);
}
