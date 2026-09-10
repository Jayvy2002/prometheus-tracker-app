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

interface FieldDraftStore {
  sets: Record<string, Record<string, unknown>>;
  exercises: Record<string, Record<string, unknown>>;
}

/**
 * D07 : après synchronisation, les ids temporaires (`local-…`) deviennent des
 * ids serveur — les brouillons de saisie suivent, sans perdre une frappe.
 */
export function migrateFieldDraftIds(idMap: Map<string, string>, oldWorkoutId: string, newWorkoutId: string): void {
  if (idMap.size === 0 && oldWorkoutId === newWorkoutId) return;
  try {
    const raw = localStorage.getItem(fieldDraftKey(oldWorkoutId));
    if (!raw) return;
    const stored = JSON.parse(raw) as FieldDraftStore;
    const remap = (bucket: Record<string, Record<string, unknown>>) => {
      const next: Record<string, Record<string, unknown>> = {};
      for (const [id, draft] of Object.entries(bucket ?? {})) {
        next[idMap.get(id) ?? id] = draft;
      }
      return next;
    };
    localStorage.setItem(
      fieldDraftKey(newWorkoutId),
      JSON.stringify({ sets: remap(stored.sets), exercises: remap(stored.exercises) }),
    );
    if (newWorkoutId !== oldWorkoutId) localStorage.removeItem(fieldDraftKey(oldWorkoutId));
  } catch { /* ignore */ }
}
