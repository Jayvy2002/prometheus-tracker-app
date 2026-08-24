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
  language?: string;
  onboarding_completed: boolean;
  dashboard_layout: DashboardWidget[];
  health_integrations: Record<string, HealthIntegration>;
  diet_type: string;
  food_allergies: string[];
  meals_per_day: number;
  cooking_level: string;
  daily_steps_average: number;
  sleep_hours_average: number;
  training_experience: string;
  training_frequency: number;
  training_focus: string;
  injuries_limitations: string;
  stress_level: string;
  hydration_habit: string;
  supplement_use: string[];
  motivation: string;
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

export type WidgetType = 'weight' | 'calories' | 'macros' | 'water' | 'workout_volume' | 'exercise_progress' | 'steps' | 'streak' | 'weekly_goal';

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  duration_seconds: number;
  notes: string;
  completed: boolean;
  routine_id?: string | null;
  session_started_at?: string | null;
  program_assignment_id?: string | null;
  program_day_id?: string | null;
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
  superset_group_id: string | null;
  prescribed_sets?: number | null;
  prescribed_reps?: number | null;
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
  duration_seconds: number | null;
  tempo: string | null;
  cluster_rest_seconds: number | null;
  cluster_reps_per_burst: number | null;
  myo_is_activation: boolean;
  drop_percentage: number | null;
  created_at: string;
}

export type SetType = 'warmup' | 'working' | 'drop' | 'superset' | 'myo' | 'tempo' | 'isometric' | 'cluster';

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string;
  scheduled_days?: string[] | null;
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
  food_product_id?: string | null;
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

export type FoodDataSource = 'foundation' | 'sr_legacy' | 'fndds' | 'branded' | 'openfoodfacts' | 'user';

export interface FoodProduct {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  created_by: string | null;
  created_at: string;
  /** Source USDA ou 'user' pour les produits créés par l'utilisateur */
  data_source: FoodDataSource | null;
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

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
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

export type AppRole = 'free' | 'premium' | 'admin';
export type CoachingRole = 'none' | 'coach' | 'client';

export interface UserRole {
  user_id: string;
  role: AppRole;
  coaching_role: CoachingRole;
  created_at: string;
  updated_at: string;
}

export interface CoachClientLink {
  id: string;
  coach_id: string;
  client_id: string;
  status: 'active' | 'ended';
  created_at: string;
  updated_at: string;
}

export interface CoachInvite {
  id: string;
  coach_id: string;
  token: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  created_at: string;
}

export interface CoachNote {
  id: string;
  coach_id: string;
  client_id: string;
  note_date: string | null;
  workout_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CoachClientSummary {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  linked_at: string;
}

export interface CoachPreview {
  id: string;
  full_name: string;
  avatar_url: string;
}

export interface DailyCheckin {
  id: string;
  user_id: string;
  checked_at: string;
  hunger: number | null;
  fatigue: number | null;
  sleep_quality: number | null;
  sleep_hours: number | null;
  stress: number | null;
  motivation: number | null;
  muscle_soreness: number | null;
  joint_pain: number | null;
  adherence_nutrition: number | null;
  adherence_training: number | null;
  energy_level: number | null;
  mood: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type DailyCheckinInput = Partial<Omit<DailyCheckin, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & {
  checked_at: string;
};

export interface Program {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  duration_weeks: number;
  days?: ProgramDay[];
  created_at: string;
  updated_at: string;
}

export interface ProgramDay {
  id: string;
  program_id: string;
  weekday: number;
  name: string;
  routine_id: string | null;
  order_index: number;
  exercises?: ProgramDayExercise[];
  created_at: string;
}

export interface ProgramDayExercise {
  id: string;
  program_day_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
  order_index: number;
  created_at: string;
}

export interface ProgramAssignment {
  id: string;
  program_id: string;
  client_id: string;
  assigned_by: string;
  start_date: string;
  status: 'active' | 'completed' | 'paused';
  program?: Program;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateExercise {
  name: string;
  default_sets: number;
  default_reps: number;
  order_index: number;
}
