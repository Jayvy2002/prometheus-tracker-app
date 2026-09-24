/** D07 : ids temporaires stables pour les créations hors ligne. */
export function offlineTempId(opId: string): string {
  return `local-${opId}`;
}

export function isOfflineTempId(id: string): boolean {
  return id.startsWith('local-');
}

/** True when a queued payload points at a row that only exists locally. */
export function referencesOfflineTempId(value: unknown): boolean {
  if (typeof value === 'string') return isOfflineTempId(value);
  if (Array.isArray(value)) return value.some(referencesOfflineTempId);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(referencesOfflineTempId);
  return false;
}
