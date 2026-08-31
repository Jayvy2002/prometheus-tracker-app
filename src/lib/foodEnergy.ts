import { UNIT_TO_GRAMS } from './constants';

/** Official kJ → kcal factor. Used when OFF (or a log) stored kilojoules as "calories". */
export const KJ_PER_KCAL = 4.184;

/** Pure fat is ~900 kcal/100g. Anything above that cannot be kcal. */
export const MAX_KCAL_PER_100G = 900;

export interface EnergyMacros {
  protein?: number;
  carbs?: number;
  fat?: number;
  /** Grams of the logged portion. Omit for already-per-100g values. */
  grams?: number | null;
}

export function atwaterKcal(protein = 0, carbs = 0, fat = 0): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function nutrimentNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * True when `energy` is almost certainly kilojoules mislabeled as kcal:
 * impossible per-100g (>900) or ~4× the Atwater estimate from macros.
 */
export function energyLooksLikeKj(energy: number, macros: EnergyMacros = {}): boolean {
  if (!Number.isFinite(energy) || energy <= 0) return false;
  const grams = macros.grams;
  if (grams && grams > 0) {
    const per100 = (energy * 100) / grams;
    if (per100 > MAX_KCAL_PER_100G) return true;
  }
  const atw = atwaterKcal(macros.protein ?? 0, macros.carbs ?? 0, macros.fat ?? 0);
  if (atw > 20 && energy > atw * 2.5) {
    const asKcal = energy / KJ_PER_KCAL;
    return Math.abs(asKcal - atw) <= Math.abs(energy - atw);
  }
  return false;
}

export function kjToKcal(kj: number): number {
  return kj / KJ_PER_KCAL;
}

/** Convert a single energy figure that may be kJ or kcal into kcal. */
export function kcalFromEnergyValue(energy: number, macros: EnergyMacros = {}): number {
  if (!Number.isFinite(energy) || energy <= 0) return 0;
  if (energyLooksLikeKj(energy, macros)) return kjToKcal(energy);
  return energy;
}

/**
 * Map Open Food Facts nutriments to kcal / 100g.
 * Prefers a real kJ field when the kcal field is missing or is actually kJ
 * (Kallo rice cakes: energy-kcal_100g = 1900, energy_100g = 1643.5 kJ).
 */
export function kcalPer100gFromNutriments(n: Record<string, unknown>): number {
  const protein = nutrimentNumber(n.proteins_100g ?? n.proteins);
  const carbs = nutrimentNumber(n.carbohydrates_100g ?? n.carbohydrates);
  const fat = nutrimentNumber(n.fat_100g ?? n.fat);
  const macros: EnergyMacros = { protein, carbs, fat, grams: 100 };

  const kcal = nutrimentNumber(n['energy-kcal_100g'] ?? n['energy-kcal']);
  const kj = nutrimentNumber(n['energy-kj_100g'] ?? n['energy_100g'] ?? n.energy);

  const kcalIsKj = kcal > 0 && energyLooksLikeKj(kcal, macros);
  if (kj > 0 && (kcal <= 0 || kcalIsKj)) return kjToKcal(kj);
  if (kcal > 0) return kcalIsKj ? kjToKcal(kcal) : kcal;
  if (kj > 0) return kjToKcal(kj);
  return 0;
}

export function normalizePer100gKcal(
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): number {
  return kcalFromEnergyValue(calories, { protein, carbs, fat, grams: 100 });
}

export function gramsFromQuantity(quantity: number, unit: string, unitToGrams: Record<string, number>): number | null {
  if (!unit || unit === 'serving') return null;
  const factor = unitToGrams[unit];
  if (factor == null) return null;
  return quantity * factor;
}

export function correctLogCalories(log: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit?: string;
}): number {
  const grams = gramsFromQuantity(log.quantity ?? 0, log.unit ?? 'g', UNIT_TO_GRAMS);
  return kcalFromEnergyValue(log.calories, {
    protein: log.protein,
    carbs: log.carbs,
    fat: log.fat,
    grams,
  });
}

export function correctNutritionLogEnergy<T extends {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit?: string;
}>(log: T): T {
  const calories = correctLogCalories(log);
  if (calories === log.calories) return log;
  return { ...log, calories };
}

export function normalizeFoodProductEnergy<T extends {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}>(product: T): T {
  const calories_per_100g = normalizePer100gKcal(
    product.calories_per_100g,
    product.protein_per_100g,
    product.carbs_per_100g,
    product.fat_per_100g,
  );
  if (calories_per_100g === product.calories_per_100g) return product;
  return { ...product, calories_per_100g };
}
