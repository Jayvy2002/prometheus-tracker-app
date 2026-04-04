import { ACTIVITY_LEVELS, GOALS } from './constants';

export function calculateBMR(weightKg: number, heightCm: number, age: number, gender: string): number {
  if (gender === 'female') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

export function calculateTDEE(bmr: number, activityLevel: string): number {
  const level = ACTIVITY_LEVELS.find(l => l.value === activityLevel);
  return Math.round(bmr * (level?.multiplier ?? 1.55));
}

export function calculateCalorieTarget(tdee: number, goal: string): number {
  const g = GOALS.find(g => g.value === goal);
  return Math.round(tdee + (g?.modifier ?? 0));
}

export function calculateMacros(calorieTarget: number, goal: string) {
  let proteinPct: number, fatPct: number, carbsPct: number;
  if (goal === 'cut') {
    // Sèche : protéine élevée pour préserver la masse, lipides modérés
    proteinPct = 0.35; fatPct = 0.30; carbsPct = 0.35;
  } else if (goal === 'bulk') {
    // Prise de masse : glucides élevés pour l'énergie et l'anabolisme
    proteinPct = 0.30; fatPct = 0.25; carbsPct = 0.45;
  } else {
    // Maintien : macros équilibrées, plus de lipides que la prise de masse
    proteinPct = 0.30; fatPct = 0.30; carbsPct = 0.40;
  }
  return {
    protein: Math.round((calorieTarget * proteinPct) / 4),
    fat: Math.round((calorieTarget * fatPct) / 9),
    carbs: Math.round((calorieTarget * carbsPct) / 4),
  };
}

export function getAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

export function cmToIn(cm: number): number {
  return Math.round(cm / 2.54 * 10) / 10;
}

export function inToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

export function formatWeight(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') return `${kgToLbs(kg)} lbs`;
  return `${Math.round(kg * 10) / 10} kg`;
}

export function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function parseDate(dateStr: string): Date {
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    const d = new Date(dateStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return parseDateStr(dateStr);
}

export function formatDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateShort(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function todayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
