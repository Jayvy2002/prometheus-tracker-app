export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  gender: string;
  date_of_birth: string | null;
  height_cm: number;
  weight_kg: number;
  activity_level: string;
  goal: string;
  target_weight_kg: number;
  daily_calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  daily_water_target_ml: number;
  daily_steps_target: number;
  unit_weight: 'kg' | 'lbs';
  unit_distance: 'km' | 'mi';
  unit_height: 'cm' | 'in';
  avatar_url: string;
  onboarding_completed: boolean;
  dashboard_layout: DashboardWidget[];
  health_integrations: Record<string, HealthIntegration>;
  created_at: string;
  updated_at: string;
}

export interface HealthIntegration {
  connected: boolean;
  last_synced: string | null;
  provider: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  size: 'small' | 'medium' | 'large';
  order: number;
  row?: number;
  col?: number;
}

export type WidgetType = 'weight' | 'calories' | 'macros' | 'water' | 'workout_volume' | 'exercise_progress' | 'steps' | 'streak';

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  duration_seconds: number;
  notes: string;
  completed: boolean;
  routine_id?: string | null;
  exercises?: WorkoutExercise[];
  created_at: string;
  updated_at: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  order_index: number;
  notes: string;
  sets?: WorkoutSet[];
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_type: SetType;
  weight_kg: number;
  reps: number;
  rir: number;
  completed: boolean;
  order_index: number;
  created_at: string;
}

export type SetType = 'warmup' | 'working' | 'drop' | 'failure';

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string;
  exercises?: RoutineExercise[];
  created_at: string;
  updated_at: string;
}

export interface RoutineExercise {
  id: string;
  routine_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
  order_index: number;
  notes: string;
  created_at: string;
}

export interface WeightMeasurement {
  id: string;
  user_id: string;
  weight_kg: number;
  measured_at: string;
  notes: string;
  created_at: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: MealCategory;
  quantity: number;
  unit: string;
  logged_at: string;
  created_at: string;
}

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface WaterLog {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  name_fr: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  category: string;
  equipment: string;
  instructions: string;
  tips: string;
  difficulty: string;
  verified: boolean;
  created_by: string | null;
  created_at: string;
}

export type ExerciseRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected';

export interface ExerciseRequest {
  id: string;
  user_id: string;
  name: string;
  muscles: string;
  description: string;
  status: ExerciseRequestStatus;
  result_exercise_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface FoodProduct {
  id: string;
  barcode: string | null;
  name: string;
  brand: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  created_by: string | null;
  created_at: string;
}

export type ProductRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number;
  carbs_per_serving: number;
  fat_per_serving: number;
  ingredients?: RecipeIngredient[];
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  order_index: number;
  created_at: string;
}

export interface FoodFavorite {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string;
  brand: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  created_at: string;
}

export interface DailySteps {
  id: string;
  user_id: string;
  steps: number;
  logged_at: string;
  created_at: string;
}

export interface ProductRequest {
  id: string;
  user_id: string;
  barcode: string;
  notes: string;
  image_front: string;
  image_back: string;
  image_nutrition: string;
  status: ProductRequestStatus;
  result_product_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}
