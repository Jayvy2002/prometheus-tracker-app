import type { FoodProduct } from './types';
import {
  kcalPer100gFromNutriments,
  nutrimentNumber,
} from './foodEnergy';

export interface OffSearchHit extends FoodProduct {
  _source: 'openfoodfacts';
}

function offHost(lang: string): string {
  return lang.toLowerCase().startsWith('fr') ? 'fr.openfoodfacts.org' : 'world.openfoodfacts.org';
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

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function productsFromPayload(data: Record<string, unknown> | null): Record<string, unknown>[] {
  const list = data?.products;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object');
}

/**
 * Search Open Food Facts.
 * Do NOT pass `fields=` to cgi/search.pl — it 503s on common French queries
 * (poulet, riz) while English queries still return JSON.
 * v2 search supports fields; cgi without fields is the fallback.
 */
export async function searchOpenFoodFacts(query: string, lang = 'fr'): Promise<OffSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const encoded = encodeURIComponent(q);
  const lc = lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const host = offHost(lang);

  const v2 = await fetchJson(
    `https://world.openfoodfacts.org/api/v2/search`
      + `?search_terms=${encoded}&page_size=15&lc=${lc}&cc=${lc}`
      + `&fields=code,product_name,product_name_fr,product_name_en,brands,nutriments,serving_quantity`,
  );
  let raw = productsFromPayload(v2);

  if (raw.length === 0) {
    const unscoped = await fetchJson(
      `https://world.openfoodfacts.org/api/v2/search`
        + `?search_terms=${encoded}&page_size=15`
        + `&fields=code,product_name,product_name_fr,product_name_en,brands,nutriments,serving_quantity`,
    );
    raw = productsFromPayload(unscoped);
  }

  if (raw.length === 0) {
    const cgi = await fetchJson(
      `https://${host}/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=15`,
    );
    raw = productsFromPayload(cgi);
  }

  const mapped: OffSearchHit[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const hit = mapOffProduct(p);
    if (!hit) continue;
    const key = hit.barcode || hit.name;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push(hit);
    if (mapped.length >= 15) break;
  }
  return mapped;
}
