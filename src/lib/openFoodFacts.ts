import type { FoodProduct } from './types';
import {
  kcalPer100gFromNutriments,
  nutrimentNumber,
} from './foodEnergy';

export interface OffSearchHit extends FoodProduct {
  _source: 'openfoodfacts';
}

/**
 * D06 — contrat Open Food Facts conforme à la doc officielle
 * (https://openfoodfacts.github.io/openfoodfacts-server/api/) :
 * - plein texte = `/cgi/search.pl` legacy (v2 `/api/v2/search` est une
 *   recherche structurée par facettes, pas du plein texte) ;
 * - 10 recherches/min/IP — JAMAIS d'appel à la frappe : OFF n'est interrogé
 *   que sur action explicite (bouton/Entrée), avec budget glissant partagé ;
 * - timeout + annulation ; pays (cc/hôte) séparé de la langue (lc).
 */

export const OFF_SEARCH_TIMEOUT_MS = 8000;
export const OFF_MAX_CALLS_PER_MINUTE = 10;

const callTimestamps: number[] = [];

/** Budget glissant partagé : false = OFF sauté, résultats locaux uniquement. */
export function consumeOffBudget(now: number = Date.now()): boolean {
  while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) callTimestamps.shift();
  if (callTimestamps.length >= OFF_MAX_CALLS_PER_MINUTE) return false;
  callTimestamps.push(now);
  return true;
}

export function resetOffBudgetForTests(): void {
  callTimestamps.length = 0;
}

export type OffSearchErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'aborted';

export class OffSearchError extends Error {
  readonly kind: OffSearchErrorKind;
  constructor(kind: OffSearchErrorKind) {
    super(`openfoodfacts:${kind}`);
    this.kind = kind;
  }
}

function offHost(country: string): string {
  return country.toLowerCase() === 'fr' ? 'fr.openfoodfacts.org' : 'world.openfoodfacts.org';
}

function productName(p: Record<string, unknown>): string {
  const name = [p.product_name, p.product_name_fr, p.product_name_en]
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean);
  return name ?? '';
}

export function mapOffProduct(p: Record<string, unknown>): OffSearchHit | null {
  const name = productName(p);
  if (!name) return null;
  const n = (p.nutriments && typeof p.nutriments === 'object'
    ? p.nutriments
    : {}) as Record<string, unknown>;
  const serving = nutrimentNumber(p.serving_quantity);
  return {
    id: '',
    barcode: typeof p.code === 'string' && p.code ? p.code : null,
    name,
    brand: typeof p.brands === 'string' && p.brands ? p.brands : null,
    calories_per_100g: kcalPer100gFromNutriments(n),
    protein_per_100g: nutrimentNumber(n.proteins_100g ?? n.proteins),
    carbs_per_100g: nutrimentNumber(n.carbohydrates_100g ?? n.carbohydrates),
    fat_per_100g: nutrimentNumber(n.fat_100g ?? n.fat),
    serving_size: serving > 0 ? serving : 100,
    serving_unit: 'g',
    created_by: null,
    created_at: '',
    data_source: 'openfoodfacts',
    _source: 'openfoodfacts',
  };
}

function productsFromPayload(data: Record<string, unknown> | null): Record<string, unknown>[] {
  const list = data?.products;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object');
}

export interface OffSearchOptions {
  lang?: string;
  /** Pays de commercialisation (cc/hôte) — indépendant de la langue d'interface. */
  country?: string;
  signal?: AbortSignal;
}

/**
 * Recherche plein texte Open Food Facts — appel EXPLICITE uniquement.
 * Jamais à la frappe (banni par la doc OFF). Lance OffSearchError en cas
 * d'échec ; l'appelant garde les résultats locaux.
 */
export async function searchOpenFoodFacts(
  query: string,
  opts: OffSearchOptions = {},
): Promise<OffSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (opts.signal?.aborted) throw new OffSearchError('aborted');
  if (!consumeOffBudget()) throw new OffSearchError('rate_limited');

  const country = (opts.country ?? 'fr').toLowerCase();
  const lang = (opts.lang ?? 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const host = offHost(country);
  // Pas de `fields=` sur cgi/search.pl : 503 sur des requêtes FR courantes.
  const url = `https://${host}/cgi/search.pl`
    + `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1`
    + `&page_size=20&cc=${encodeURIComponent(country)}&lc=${lang}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_SEARCH_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) throw new OffSearchError('rate_limited');
    if (!res.ok) throw new OffSearchError('unavailable');
    const data = await res.json().catch(() => null);
    const raw = productsFromPayload(data && typeof data === 'object' ? data as Record<string, unknown> : null);
    const mapped: OffSearchHit[] = [];
    const seen = new Set<string>();
    for (const p of raw) {
      const hit = mapOffProduct(p);
      if (!hit) continue;
      const key = hit.barcode || hit.name;
      if (seen.has(key)) continue;
      seen.add(key);
      mapped.push(hit);
      if (mapped.length >= 20) break;
    }
    return mapped;
  } catch (err) {
    if (err instanceof OffSearchError) throw err;
    if (opts.signal?.aborted) throw new OffSearchError('aborted');
    if (controller.signal.aborted) throw new OffSearchError('timeout');
    throw new OffSearchError('unavailable');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}
