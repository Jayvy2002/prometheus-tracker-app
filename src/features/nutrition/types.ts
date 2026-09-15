/** Contrats nutrition / recettes / produits — lot 22a. */

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

export interface DailyNutritionPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  target: number;
}
