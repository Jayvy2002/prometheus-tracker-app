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

export interface SetTypeConfig {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
  dotColor: string;
  bgColor: string;
  restBehavior: 'normal' | 'none' | 'short' | 'custom';
  defaultRestSeconds: number;
}

export const SET_TYPES: SetTypeConfig[] = [
  { value: 'warmup', label: 'Warm-up', shortLabel: 'W', color: 'text-amber-400', dotColor: 'bg-amber-400', bgColor: 'bg-amber-400/15', restBehavior: 'none', defaultRestSeconds: 0 },
  { value: 'working', label: 'Working', shortLabel: 'S', color: 'text-blue-400', dotColor: 'bg-blue-400', bgColor: 'bg-blue-400/15', restBehavior: 'normal', defaultRestSeconds: 90 },
  { value: 'drop', label: 'Drop', shortLabel: 'D', color: 'text-sky-400', dotColor: 'bg-sky-400', bgColor: 'bg-sky-400/15', restBehavior: 'none', defaultRestSeconds: 0 },
  { value: 'superset', label: 'Superset', shortLabel: 'SS', color: 'text-green-400', dotColor: 'bg-green-400', bgColor: 'bg-green-400/15', restBehavior: 'normal', defaultRestSeconds: 90 },
  { value: 'myo', label: 'Myo-rep', shortLabel: 'M', color: 'text-rose-400', dotColor: 'bg-rose-400', bgColor: 'bg-rose-400/15', restBehavior: 'short', defaultRestSeconds: 10 },
  { value: 'tempo', label: 'Tempo', shortLabel: 'T', color: 'text-teal-400', dotColor: 'bg-teal-400', bgColor: 'bg-teal-400/15', restBehavior: 'normal', defaultRestSeconds: 90 },
  { value: 'isometric', label: 'Iso', shortLabel: 'I', color: 'text-orange-400', dotColor: 'bg-orange-400', bgColor: 'bg-orange-400/15', restBehavior: 'normal', defaultRestSeconds: 90 },
  { value: 'cluster', label: 'Cluster', shortLabel: 'C', color: 'text-cyan-400', dotColor: 'bg-cyan-400', bgColor: 'bg-cyan-400/15', restBehavior: 'custom', defaultRestSeconds: 20 },
];

export const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast', icon: 'Sunrise' },
  { value: 'lunch', label: 'Lunch', icon: 'Sun' },
  { value: 'dinner', label: 'Dinner', icon: 'Moon' },
  { value: 'snack', label: 'Snack', icon: 'Cookie' },
] as const;

export const FOOD_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'cup', 'tbsp', 'tsp', 'serving'] as const;

/** Conversion factor → grams (or ml, treated as g for liquids).
 *  'serving' is intentionally absent — handled specially in forms (scale = number of servings). */
export const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.35,
  lb: 453.6,
  ml: 1,
  cup: 240,
  tbsp: 15,
  tsp: 5,
};

export const DIET_TYPES = [
  { value: 'omnivore', label: 'Omnivore', description: 'No dietary restrictions' },
  { value: 'vegetarian', label: 'Vegetarian', description: 'No meat or fish' },
  { value: 'vegan', label: 'Vegan', description: 'No animal products' },
  { value: 'pescatarian', label: 'Pescatarian', description: 'Fish but no meat' },
  { value: 'paleo', label: 'Paleo', description: 'Whole foods, no grains/dairy' },
  { value: 'keto', label: 'Keto', description: 'Very low carb, high fat' },
  { value: 'carnivore', label: 'Carnivore', description: 'Animal products only' },
  { value: 'mediterranean', label: 'Mediterranean', description: 'Balanced, plant-rich' },
  { value: 'halal', label: 'Halal', description: 'Islamic dietary laws' },
  { value: 'gluten_free', label: 'Gluten Free', description: 'No gluten-containing foods' },
] as const;

export const FOOD_ALLERGIES = [
  { value: 'dairy', label: 'Dairy' },
  { value: 'gluten', label: 'Gluten' },
  { value: 'nuts', label: 'Tree Nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'soy', label: 'Soy' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'fish', label: 'Fish' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'corn', label: 'Corn' },
  { value: 'sulfites', label: 'Sulfites' },
  { value: 'lactose', label: 'Lactose' },
] as const;

export const COOKING_LEVELS = [
  { value: 'none', label: 'None', description: 'I don\'t cook' },
  { value: 'basic', label: 'Basic', description: 'Simple meals only' },
  { value: 'intermediate', label: 'Intermediate', description: 'Comfortable in the kitchen' },
  { value: 'advanced', label: 'Advanced', description: 'I enjoy complex recipes' },
] as const;

export const TRAINING_EXPERIENCES = [
  { value: 'beginner', label: 'Beginner', description: '0-1 year of training' },
  { value: 'intermediate', label: 'Intermediate', description: '1-3 years of training' },
  { value: 'advanced', label: 'Advanced', description: '3-5 years of training' },
  { value: 'elite', label: 'Elite', description: '5+ years of training' },
] as const;

export const TRAINING_FOCUSES = [
  { value: 'hypertrophy', label: 'Hypertrophy', description: 'Muscle growth' },
  { value: 'strength', label: 'Strength', description: 'Max force production' },
  { value: 'endurance', label: 'Endurance', description: 'Stamina & conditioning' },
  { value: 'powerlifting', label: 'Powerlifting', description: 'Squat, Bench, Deadlift' },
  { value: 'crossfit', label: 'CrossFit', description: 'Functional fitness' },
  { value: 'calisthenics', label: 'Calisthenics', description: 'Bodyweight mastery' },
  { value: 'mixed', label: 'Mixed', description: 'General fitness' },
] as const;

export const STRESS_LEVELS = [
  { value: 'low', label: 'Low', description: 'Calm and relaxed' },
  { value: 'moderate', label: 'Moderate', description: 'Average day-to-day stress' },
  { value: 'high', label: 'High', description: 'Frequently stressed' },
  { value: 'very_high', label: 'Very High', description: 'Chronic high stress' },
] as const;

export const HYDRATION_HABITS = [
  { value: 'poor', label: 'Poor', description: 'I often forget to drink' },
  { value: 'average', label: 'Average', description: 'I drink when thirsty' },
  { value: 'good', label: 'Good', description: 'I actively track my water' },
] as const;

export const SUPPLEMENTS = [
  { value: 'creatine', label: 'Creatine' },
  { value: 'protein_powder', label: 'Protein Powder' },
  { value: 'caffeine', label: 'Caffeine/Pre-Workout' },
  { value: 'omega3', label: 'Omega-3 / Fish Oil' },
  { value: 'vitamin_d', label: 'Vitamin D' },
  { value: 'multivitamin', label: 'Multivitamin' },
  { value: 'bcaa', label: 'BCAAs' },
  { value: 'magnesium', label: 'Magnesium' },
  { value: 'zinc', label: 'Zinc' },
  { value: 'collagen', label: 'Collagen' },
] as const;

export const MOTIVATIONS = [
  { value: 'aesthetics', label: 'Aesthetics', description: 'Look my best' },
  { value: 'health', label: 'Health', description: 'Long-term wellness' },
  { value: 'performance', label: 'Performance', description: 'Get stronger/faster' },
  { value: 'sport', label: 'Sport Specific', description: 'Improve in my sport' },
  { value: 'mental_health', label: 'Mental Health', description: 'Stress relief & clarity' },
  { value: 'rehabilitation', label: 'Rehabilitation', description: 'Recover from injury' },
] as const;
