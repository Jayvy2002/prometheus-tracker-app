/** D07 : ids temporaires stables pour les créations hors ligne. */
export function offlineTempId(opId: string): string {
  return `local-${opId}`;
}

export function isOfflineTempId(id: string): boolean {
  return id.startsWith('local-');
}
