/**
 * Vision §33 — contextual search. Candidates are only ever what the signed-in
 * person can already read (their own rows, or their Coach scope under RLS):
 * search ranks, it never widens access, so it cannot reveal that a resource
 * exists elsewhere.
 */
import { scoreAgainstQuery, type TextField } from '../../workout/domain/pickerSearch';

export type SearchScope = 'coach' | 'personal';

export type SearchCategory =
  | 'clients'
  | 'prospects'
  | 'programs'
  | 'exercises'
  | 'conversations'
  | 'sessions'
  | 'routines'
  | 'personal';

/** Order of the groups, per workspace (Vision §33 lists). */
export const SEARCH_CATEGORIES: Record<SearchScope, SearchCategory[]> = {
  coach: ['clients', 'prospects', 'programs', 'exercises', 'conversations'],
  personal: ['exercises', 'sessions', 'routines', 'programs', 'personal'],
};

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_PER_CATEGORY = 5;

export interface SearchItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  /** In-app route, an external link (exercise video), or null for an info row. */
  href: string | null;
  external?: boolean;
  fields: TextField[];
}

export interface SearchGroup {
  category: SearchCategory;
  items: SearchItem[];
}

export function searchReady(query: string): boolean {
  return query.trim().length >= SEARCH_MIN_CHARS;
}

/**
 * Best matches first inside each group; groups in the workspace order; a
 * category that does not belong to the scope is dropped even if supplied.
 */
export function rankSearch(
  items: SearchItem[],
  query: string,
  scope: SearchScope,
  perCategory = SEARCH_PER_CATEGORY,
): SearchGroup[] {
  if (!searchReady(query)) return [];
  const allowed = SEARCH_CATEGORIES[scope];
  const scored = items
    .filter(item => allowed.includes(item.category))
    .map(item => ({ item, score: scoreAgainstQuery(query, item.fields) }))
    .filter(row => row.score >= 40);
  return allowed
    .map(category => ({
      category,
      items: scored
        .filter(row => row.item.category === category)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, perCategory)
        .map(row => row.item),
    }))
    .filter(group => group.items.length > 0);
}

/** Server-side filter text for ilike: wildcards and commas of the query are literal. */
export function ilikePattern(query: string): string {
  const escaped = query.trim().slice(0, 80).replace(/[\\%_]/g, char => `\\${char}`);
  return `%${escaped}%`;
}

/** A conversation hit shows the matching words, not the whole message. */
export function snippetAround(text: string, query: string, radius = 36): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const at = fold(flat).indexOf(fold(query.trim()));
  if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2 - 1)}…` : flat;
  // Widen to whole words so the snippet never starts or ends mid-word.
  let start = Math.max(0, at - radius);
  if (start > 0) start = flat.lastIndexOf(' ', start) + 1;
  let end = Math.min(flat.length, at + query.trim().length + radius);
  if (end < flat.length) {
    const next = flat.indexOf(' ', end);
    end = next < 0 ? flat.length : next;
  }
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

export function field(text: string | null | undefined, weight = 1): TextField {
  return { text: text ?? '', weight };
}
