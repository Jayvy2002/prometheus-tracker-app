import { scopedKey, getSessionOwner } from './sessionScope';

export function fieldDraftKey(workoutId: string): string {
  // S05 : brouillons isolés par compte. Les anciennes clés globales ne sont
  // jamais relues (pas de fuite A → B) ; elles sont supprimées au mieux.
  return scopedKey('prometheus_field_draft', workoutId);
}

function removeLegacyGlobalKey(workoutId: string): void {
  try {
    localStorage.removeItem(`prometheus_field_draft_${workoutId}`);
  } catch { /* ignore */ }
}

export function clearFieldDrafts(workoutId: string): void {
  try {
    localStorage.removeItem(fieldDraftKey(workoutId));
    removeLegacyGlobalKey(workoutId);
  } catch {
    // ignore
  }
}

/** Purge les brouillons de saisie du compte courant (logout / changement de compte). */
export function clearFieldDraftsForOwner(): void {
  const owner = getSessionOwner() ?? 'anon';
  const prefix = `prometheus_field_draft_${owner}_`;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
