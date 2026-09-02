import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class merge for UI primitives. Keep BMR/TDEE helpers in `utils.ts`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
