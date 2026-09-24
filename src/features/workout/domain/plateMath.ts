export type WeightUnit = 'kg' | 'lbs';

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LBS_PLATES = [55, 45, 35, 25, 10, 5, 2.5];

export interface PlatePair {
  plate: number;
  count: number;
}

export interface PlateStyle {
  bg: string;
  text: string;
  ring: string;
}

/** IWF / calibrated bumper colours (kg) and the matching lbs sizes. */
const KG_STYLE: Record<number, PlateStyle> = {
  25: { bg: 'bg-red-600', text: 'text-white', ring: 'ring-red-300/40' },
  20: { bg: 'bg-blue-600', text: 'text-white', ring: 'ring-blue-300/40' },
  15: { bg: 'bg-yellow-400', text: 'text-neutral-950', ring: 'ring-yellow-200/50' },
  10: { bg: 'bg-green-600', text: 'text-white', ring: 'ring-green-300/40' },
  5: { bg: 'bg-white', text: 'text-neutral-950', ring: 'ring-neutral-300' },
  2.5: { bg: 'bg-neutral-800', text: 'text-white', ring: 'ring-2 ring-neutral-400' },
  1.25: { bg: 'bg-neutral-400', text: 'text-neutral-950', ring: 'ring-neutral-200' },
};

const LBS_STYLE: Record<number, PlateStyle> = {
  55: { bg: 'bg-red-600', text: 'text-white', ring: 'ring-red-300/40' },
  45: { bg: 'bg-blue-600', text: 'text-white', ring: 'ring-blue-300/40' },
  35: { bg: 'bg-yellow-400', text: 'text-neutral-950', ring: 'ring-yellow-200/50' },
  25: { bg: 'bg-green-600', text: 'text-white', ring: 'ring-green-300/40' },
  10: { bg: 'bg-white', text: 'text-neutral-950', ring: 'ring-2 ring-neutral-400' },
  5: { bg: 'bg-neutral-800', text: 'text-white', ring: 'ring-2 ring-neutral-400' },
  2.5: { bg: 'bg-neutral-400', text: 'text-neutral-950', ring: 'ring-neutral-200' },
};

const KG_HEIGHT: Record<number, number> = {
  25: 112, 20: 104, 15: 96, 10: 84, 5: 64, 2.5: 48, 1.25: 36,
};
const LBS_HEIGHT: Record<number, number> = {
  55: 112, 45: 104, 35: 96, 25: 84, 10: 64, 5: 48, 2.5: 36,
};
const KG_WIDTH: Record<number, number> = {
  25: 22, 20: 18, 15: 16, 10: 14, 5: 12, 2.5: 10, 1.25: 8,
};
const LBS_WIDTH: Record<number, number> = {
  55: 22, 45: 18, 35: 16, 25: 14, 10: 12, 5: 10, 2.5: 8,
};

export function standardBarKg(unit: WeightUnit): number {
  return unit === 'lbs' ? 45 : 20;
}

export function plateInventory(unit: WeightUnit): number[] {
  return unit === 'lbs' ? [...LBS_PLATES] : [...KG_PLATES];
}

export function plateStyle(plate: number, unit: WeightUnit): PlateStyle {
  const table = unit === 'lbs' ? LBS_STYLE : KG_STYLE;
  return table[plate] ?? { bg: 'bg-neutral-700', text: 'text-white', ring: 'ring-[#737373]' };
}

export function plateHeightPx(plate: number, unit: WeightUnit): number {
  const table = unit === 'lbs' ? LBS_HEIGHT : KG_HEIGHT;
  return table[plate] ?? 48;
}

export function plateWidthPx(plate: number, unit: WeightUnit): number {
  const table = unit === 'lbs' ? LBS_WIDTH : KG_WIDTH;
  return table[plate] ?? 12;
}

export function expandPairs(pairs: PlatePair[]): number[] {
  return pairs.flatMap(row => Array.from({ length: row.count }, () => row.plate));
}

export function sideLoad(plates: number[]): number {
  return Math.round(plates.reduce((sum, plate) => sum + plate, 0) * 1000) / 1000;
}

export function totalFromSleeve(plates: number[], bar: number): number {
  return Math.round((bar + 2 * sideLoad(plates)) * 1000) / 1000;
}

/** Even pairs per side for a barbell load. Remainder is leftover that cannot be plated. */
export function platesForLoad(
  total: number,
  unit: WeightUnit,
  bar = standardBarKg(unit),
): { perSide: PlatePair[]; leftover: number } {
  const plates = plateInventory(unit);
  let perSide = (total - bar) / 2;
  if (!Number.isFinite(perSide) || perSide < 0) {
    return { perSide: [], leftover: Math.max(0, total) };
  }
  const out: PlatePair[] = [];
  for (const plate of plates) {
    const count = Math.floor((perSide + 1e-6) / plate);
    if (count <= 0) continue;
    out.push({ plate, count });
    perSide -= count * plate;
  }
  return { perSide: out, leftover: Math.round(perSide * 1000) / 1000 };
}
