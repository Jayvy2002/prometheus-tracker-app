const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LBS_PLATES = [45, 35, 25, 10, 5, 2.5];

export function standardBarKg(unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? 45 : 20;
}

export function plateInventory(unit: 'kg' | 'lbs'): number[] {
  return unit === 'lbs' ? LBS_PLATES : KG_PLATES;
}

export interface PlatePair {
  plate: number;
  count: number;
}

/** Even pairs per side for a barbell load. Remainder is leftover that cannot be plated. */
export function platesForLoad(
  total: number,
  unit: 'kg' | 'lbs',
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
