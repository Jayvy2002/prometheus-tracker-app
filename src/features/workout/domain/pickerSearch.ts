import { foldText } from '../../../lib/coachText';
import { muscleLabel } from './muscleLabels';
import type { Exercise, FoodFavorite, FoodProduct } from '../../../lib/types';

export const FOOD_SEARCH_MIN_CHARS = 2;
export const FOOD_SEARCH_DEBOUNCE_MS = 280;
export const FOOD_SEARCH_LIMIT = 20;

export type FoodHitSource = 'recent' | 'favorite' | 'db' | 'openfoodfacts';

export interface RankedFoodHit extends FoodProduct {
  _source: FoodHitSource;
}

export interface TextField {
  text: string;
  weight: number;
}

/** Common FR/EN nicknames so “bp” / “rdl” / “développé” hit the library. */
const EXERCISE_ALIASES: Array<{ canon: string; aliases: string[] }> = [
  { canon: 'bench press', aliases: ['bp', 'developpe couche', 'developpe couche barre', 'chest press'] },
  { canon: 'incline bench', aliases: ['developpe incline'] },
  { canon: 'overhead press', aliases: ['ohp', 'military press', 'developpe militaire', 'shoulder press'] },
  { canon: 'squat', aliases: ['back squat', 'squat barre'] },
  { canon: 'front squat', aliases: ['squat avant'] },
  { canon: 'deadlift', aliases: ['souleve de terre', 'sdt'] },
  { canon: 'romanian deadlift', aliases: ['rdl', 'souleve de terre roumain'] },
  { canon: 'barbell row', aliases: ['row barre', 'bent over row', 'rowing barre'] },
  { canon: 'pull up', aliases: ['pullup', 'pull-up', 'tractions'] },
  { canon: 'chin up', aliases: ['chinup', 'tractions supination'] },
  { canon: 'lat pulldown', aliases: ['tirage vertical', 'tirage poulie haute'] },
  { canon: 'hip thrust', aliases: ['hipthrust', 'pont fessier'] },
  { canon: 'face pull', aliases: ['face pulls'] },
  { canon: 'lateral raise', aliases: ['elevations laterales', 'side raise'] },
  { canon: 'bicep curl', aliases: ['curl biceps', 'curl barre'] },
  { canon: 'tricep', aliases: ['extension triceps', 'triceps extension'] },
  { canon: 'leg press', aliases: ['presse a cuisses'] },
  { canon: 'lunge', aliases: ['fentes', 'fentes marchees'] },
  { canon: 'rdl', aliases: ['romanian deadlift'] },
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a || !b) return 99;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function fuzzyWordScore(query: string, hay: string): number {
  if (query.length < 4) return 0;
  let best = 0;
  for (const word of hay.split(/\s+/)) {
    if (word.length < 4) continue;
    const d = levenshtein(query, word);
    if (d <= 1) best = Math.max(best, 68);
    else if (d === 2 && query.length >= 6) best = Math.max(best, 56);
  }
  return best;
}

export function scoreAgainstQuery(query: string, fields: TextField[]): number {
  const q = foldText(query);
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  let best = 0;
  for (const field of fields) {
    const hay = foldText(field.text);
    if (!hay) continue;
    let s = 0;
    if (hay === q) s = 100;
    else if (hay.startsWith(q) || (q.startsWith(hay) && hay.length >= 3)) s = 88;
    else if (hay.includes(` ${q} `) || hay.startsWith(`${q} `) || hay.endsWith(` ${q}`)) s = 80;
    else if (hay.includes(q)) s = 72;
    else {
      const hits = tokens.filter(tok => tok.length >= 2 && hay.includes(tok));
      if (hits.length === tokens.length && tokens.length > 0) s = 64;
      else if (hits.length > 0) s = Math.round(48 * (hits.length / tokens.length));
      s = Math.max(s, fuzzyWordScore(q, hay));
    }
    best = Math.max(best, s * field.weight);
  }
  return best;
}

export function foodIdentity(p: Pick<FoodProduct, 'barcode' | 'name' | 'brand'>): string {
  const code = (p.barcode || '').trim();
  if (code) return `bc:${code}`;
  return `nm:${foldText(p.name)}|${foldText(p.brand ?? '')}`;
}

function favoriteAsProduct(f: FoodFavorite): FoodProduct {
  return {
    id: f.product_id ?? '',
    barcode: null,
    name: f.product_name,
    brand: f.brand || null,
    calories_per_100g: f.calories_per_100g,
    protein_per_100g: f.protein_per_100g,
    carbs_per_100g: f.carbs_per_100g,
    fat_per_100g: f.fat_per_100g,
    serving_size: f.serving_size,
    serving_unit: f.serving_unit,
    created_by: null,
    created_at: f.created_at,
    data_source: null,
  };
}

const SOURCE_RANK: Record<FoodHitSource, number> = {
  favorite: 3,
  recent: 2,
  db: 1,
  openfoodfacts: 0,
};

export function mergeRankedFoodHits(input: {
  query: string;
  db: FoodProduct[];
  off: FoodProduct[];
  recents: FoodProduct[];
  favorites: FoodFavorite[];
  limit?: number;
}): RankedFoodHit[] {
  const q = input.query.trim();
  if (!q) return [];
  const map = new Map<string, { hit: RankedFoodHit; score: number }>();

  const add = (product: FoodProduct, source: FoodHitSource, boost: number) => {
    const fields: TextField[] = [
      { text: product.name, weight: 1 },
      { text: product.brand ?? '', weight: 0.92 },
    ];
    const score = scoreAgainstQuery(q, fields) + boost;
    if (score <= 0) return;
    const key = foodIdentity(product);
    const hit: RankedFoodHit = { ...product, _source: source };
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { hit, score });
      return;
    }
    const keepSource = SOURCE_RANK[source] >= SOURCE_RANK[existing.hit._source] ? source : existing.hit._source;
    map.set(key, {
      score: Math.max(existing.score, score),
      hit: {
        ...existing.hit,
        ...hit,
        id: existing.hit.id || hit.id,
        barcode: existing.hit.barcode || hit.barcode,
        _source: keepSource,
      },
    });
  };

  for (const p of input.favorites) add(favoriteAsProduct(p), 'favorite', 18);
  for (const p of input.recents) add(p, 'recent', 12);
  for (const p of input.db) add(p, 'db', 4);
  for (const p of input.off) add(p, 'openfoodfacts', 0);

  return [...map.values()]
    .sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name))
    .slice(0, input.limit ?? FOOD_SEARCH_LIMIT)
    .map(row => row.hit);
}

function aliasesForExercise(ex: Exercise): string[] {
  const hay = `${foldText(ex.name)} ${foldText(ex.name_fr)}`;
  const out: string[] = [];
  for (const row of EXERCISE_ALIASES) {
    const needles = [row.canon, ...row.aliases].map(foldText);
    if (needles.some(n => n && hay.includes(n))) {
      out.push(row.canon, ...row.aliases);
    }
  }
  return out;
}

export function exerciseSearchFields(ex: Exercise, lang = 'fr'): TextField[] {
  const fields: TextField[] = [
    { text: ex.name, weight: 1 },
    { text: ex.name_fr, weight: 1 },
    { text: ex.equipment, weight: 0.35 },
  ];
  for (const alias of aliasesForExercise(ex)) {
    fields.push({ text: alias, weight: 0.94 });
  }
  for (const muscle of ex.primary_muscles) {
    fields.push({ text: muscle, weight: 0.48 });
    fields.push({ text: muscleLabel(muscle, lang), weight: 0.48 });
  }
  return fields;
}

export function rankExercises(exercises: Exercise[], query: string, lang = 'fr'): Exercise[] {
  const q = query.trim();
  if (!q) return exercises;
  return exercises
    .map(ex => ({ ex, score: scoreAgainstQuery(q, exerciseSearchFields(ex, lang)) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
    .map(row => row.ex);
}

export function isExactExerciseMatch(query: string, ex: Exercise): boolean {
  const q = foldText(query);
  if (!q) return false;
  return foldText(ex.name) === q || foldText(ex.name_fr) === q;
}

export function displayExerciseName(ex: Exercise, lang = 'fr'): string {
  const fr = !lang.toLowerCase().startsWith('en');
  const local = (ex.name_fr || '').trim();
  if (fr && local) return local;
  return ex.name;
}
