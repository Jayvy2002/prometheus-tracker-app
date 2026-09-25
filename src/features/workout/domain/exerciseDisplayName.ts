import { catalogKey } from './exerciseCatalog';

/**
 * The name shown for an exercise, in the app language. Sessions, routines and
 * programs store the catalog's English name (« Plank ») next to its id; a French
 * athlete who picked « Gainage » must read « Gainage » everywhere. Display only:
 * the stored name is never changed (history and records match on it), and a
 * name the person typed or renamed stays exactly as written.
 */
export type CatalogNameRow = {
  id: string;
  name: string;
  name_fr?: string | null;
  merged_into_id?: string | null;
};

export type CatalogNameIndex = {
  byId: ReadonlyMap<string, CatalogNameRow>;
  byName: ReadonlyMap<string, CatalogNameRow>;
};

export function catalogNameIndex(rows: readonly CatalogNameRow[]): CatalogNameIndex {
  const byId = new Map<string, CatalogNameRow>();
  const byName = new Map<string, CatalogNameRow>();
  const active = rows.filter(row => !row.merged_into_id);
  for (const row of active) byId.set(row.id, row);
  // The English name is the stored identity: it wins over a French name that happens to match.
  for (const row of active) {
    const fr = row.name_fr ? catalogKey(row.name_fr) : '';
    if (fr && !byName.has(fr)) byName.set(fr, row);
  }
  for (const row of active) {
    const en = catalogKey(row.name);
    if (en) byName.set(en, row);
  }
  return { byId, byName };
}

/** Catalog name in the app language: English only for « en… », French otherwise (same rule as the picker). */
export function localizedCatalogName(row: Pick<CatalogNameRow, 'name' | 'name_fr'>, lang: string | null | undefined): string {
  return (lang ?? 'fr').toLowerCase().startsWith('en') ? row.name : (row.name_fr?.trim() || row.name);
}

/**
 * The catalog row an exercise refers to: its link first, then — for rows
 * written before the link existed or started from a template — a stored name
 * that is exactly one of the catalog's own names (accents and case aside).
 */
export function catalogRowFor(
  index: CatalogNameIndex,
  stored: string | null | undefined,
  catalogExerciseId?: string | null,
): CatalogNameRow | null {
  const key = stored ? catalogKey(stored) : '';
  const linked = catalogExerciseId ? index.byId.get(catalogExerciseId) ?? null : null;
  if (linked && key && (key === catalogKey(linked.name) || (linked.name_fr && key === catalogKey(linked.name_fr)))) {
    return linked;
  }
  // Just replaced (the link catches up later) or written before the link existed.
  return (key ? index.byName.get(key) : undefined) ?? linked;
}

export function exerciseDisplayName(
  stored: string | null | undefined,
  catalogRow: Pick<CatalogNameRow, 'name' | 'name_fr'> | null | undefined,
  lang: string | null | undefined,
): string {
  const written = stored ?? '';
  if (!catalogRow || !written.trim()) return written;
  const key = catalogKey(written);
  const isCatalogName = key === catalogKey(catalogRow.name)
    || Boolean(catalogRow.name_fr && key === catalogKey(catalogRow.name_fr));
  // A linked exercise the person renamed (« Gainage lesté ») keeps their words.
  return isCatalogName ? localizedCatalogName(catalogRow, lang) : written;
}
