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

export function displayName(client: { full_name?: string | null; email?: string | null }, unnamed = '—'): string {
  return (client.full_name || client.email || unnamed).trim() || unnamed;
}

export function datePrefix(value: string): string {
  return value.slice(0, 10);
}

export function maxIso(values: Array<string | null | undefined>): string | null {
  const present = values.filter((v): v is string => !!v);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a > b ? a : b));
}
