export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little or no exercise', multiplier: 1.2 },
  { value: 'light', label: 'Lightly Active', description: '1-3 days/week', multiplier: 1.375 },
  { value: 'moderate', label: 'Moderately Active', description: '3-5 days/week', multiplier: 1.55 },
  { value: 'active', label: 'Very Active', description: '6-7 days/week', multiplier: 1.725 },
  { value: 'very_active', label: 'Extra Active', description: 'Athlete / physical job', multiplier: 1.9 },
] as const;

export const GOALS = [
  { value: 'cut', label: 'Lose Weight', description: 'Caloric deficit', modifier: -500 },
  { value: 'maintain', label: 'Maintain', description: 'Stay at current weight', modifier: 0 },
  { value: 'bulk', label: 'Build Muscle', description: 'Caloric surplus', modifier: 300 },
] as const;

export const SET_TYPES: { value: string; label: string; color: string }[] = [
  { value: 'warmup', label: 'Warm-up', color: 'text-amber-400' },
  { value: 'working', label: 'Working', color: 'text-blue-400' },
  { value: 'drop', label: 'Drop Set', color: 'text-sky-400' },
  { value: 'failure', label: 'To Failure', color: 'text-rose-400' },
];

export const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast', icon: 'Sunrise' },
  { value: 'lunch', label: 'Lunch', icon: 'Sun' },
  { value: 'dinner', label: 'Dinner', icon: 'Moon' },
  { value: 'snack', label: 'Snack', icon: 'Cookie' },
] as const;

export const FOOD_UNITS = ['g', 'ml', 'oz', 'cup', 'tbsp', 'tsp', 'serving'] as const;

export const DEFAULT_DASHBOARD_WIDGETS = [
  { id: 'w1', type: 'calories' as const, title: 'Calories Today', config: {}, size: 'medium' as const, order: 0 },
  { id: 'w2', type: 'weight' as const, title: 'Weight Progress', config: { range: '30d' }, size: 'large' as const, order: 1 },
  { id: 'w3', type: 'water' as const, title: 'Water Intake', config: {}, size: 'small' as const, order: 2 },
  { id: 'w4', type: 'macros' as const, title: 'Macros Today', config: {}, size: 'medium' as const, order: 3 },
  { id: 'w5', type: 'workout_volume' as const, title: 'Weekly Volume', config: { range: '7d' }, size: 'medium' as const, order: 4 },
];

export const HEALTH_PROVIDERS = [
  { id: 'apple_health', name: 'Apple Health', icon: 'Heart' },
  { id: 'google_fit', name: 'Google Fit', icon: 'Activity' },
  { id: 'garmin', name: 'Garmin', icon: 'Watch' },
  { id: 'fitbit', name: 'Fitbit', icon: 'Activity' },
] as const;
