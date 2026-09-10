import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Recipe, RecipeIngredient } from '../lib/types';
import { toast } from '../components/ui/Toast';

interface RecipeState {
  recipes: Recipe[];
  loading: boolean;
  fetchRecipes: (userId: string) => Promise<void>;
  createRecipe: (recipe: Partial<Recipe>) => Promise<Recipe | null>;
  updateRecipe: (id: string, data: Partial<Recipe>) => Promise<{ error: string | null }>;
  deleteRecipe: (id: string) => Promise<{ error: string | null }>;
  addIngredient: (recipeId: string, ingredient: Partial<RecipeIngredient>) => Promise<RecipeIngredient | null>;
  updateIngredient: (id: string, data: Partial<RecipeIngredient>) => Promise<{ error: string | null }>;
  deleteIngredient: (recipeId: string, id: string) => Promise<{ error: string | null }>;
  fetchRecipeWithIngredients: (id: string) => Promise<Recipe | null>;
  recomputeMacros: (recipeId: string) => Promise<void>;
  reset: () => void;
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  loading: false,

  fetchRecipes: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    set({ recipes: (data ?? []) as Recipe[], loading: false });
  },

  createRecipe: async (recipe) => {
    const { data } = await supabase
      .from('recipes')
      .insert(recipe)
      .select()
      .maybeSingle();
    if (data) {
      const r = { ...data, ingredients: [] } as Recipe;
      set(s => ({ recipes: [r, ...s.recipes] }));
      return r;
    }
    return null;
  },

  // D03 : le store ne bouge qu'après succès serveur ; l'erreur remonte à l'appelant.
  updateRecipe: async (id, updates) => {
    const { error } = await supabase.from('recipes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return { error: error.message };
    }
    set(s => ({
      recipes: s.recipes.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
    return { error: null };
  },

  deleteRecipe: async (id) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return { error: error.message };
    }
    set(s => ({ recipes: s.recipes.filter(r => r.id !== id) }));
    return { error: null };
  },

  addIngredient: async (recipeId, ingredient) => {
    const { data } = await supabase
      .from('recipe_ingredients')
      .insert({ ...ingredient, recipe_id: recipeId })
      .select()
      .maybeSingle();
    if (data) {
      set(s => ({
        recipes: s.recipes.map(r =>
          r.id === recipeId
            ? { ...r, ingredients: [...(r.ingredients ?? []), data as RecipeIngredient] }
            : r
        ),
      }));
      await get().recomputeMacros(recipeId);
      return data as RecipeIngredient;
    }
    return null;
  },

  updateIngredient: async (id, updates) => {
    const { error } = await supabase.from('recipe_ingredients').update(updates).eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return { error: error.message };
    }
    set(s => ({
      recipes: s.recipes.map(r => ({
        ...r,
        ingredients: r.ingredients?.map(ing => ing.id === id ? { ...ing, ...updates } as RecipeIngredient : ing),
      })),
    }));
    const recipe = get().recipes.find(r => r.ingredients?.some(i => i.id === id));
    if (recipe) await get().recomputeMacros(recipe.id);
    return { error: null };
  },

  deleteIngredient: async (recipeId, id) => {
    const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return { error: error.message };
    }
    set(s => ({
      recipes: s.recipes.map(r =>
        r.id === recipeId
          ? { ...r, ingredients: r.ingredients?.filter(i => i.id !== id) }
          : r
      ),
    }));
    await get().recomputeMacros(recipeId);
    return { error: null };
  },

  fetchRecipeWithIngredients: async (id) => {
    const { data: recipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!recipe) return null;

    const { data: ingredients } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', id)
      .order('order_index');

    const full = { ...recipe, ingredients: (ingredients ?? []) as RecipeIngredient[] } as Recipe;
    set(s => ({
      recipes: s.recipes.map(r => r.id === id ? full : r),
    }));
    return full;
  },

  recomputeMacros: async (recipeId) => {
    const recipe = get().recipes.find(r => r.id === recipeId);
    if (!recipe || !recipe.ingredients) return;
    const servings = recipe.servings || 1;
    const totals = recipe.ingredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + ing.calories,
        protein: acc.protein + ing.protein,
        carbs: acc.carbs + ing.carbs,
        fat: acc.fat + ing.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const updates = {
      calories_per_serving: Math.round(totals.calories / servings),
      protein_per_serving: Math.round(totals.protein / servings),
      carbs_per_serving: Math.round(totals.carbs / servings),
      fat_per_serving: Math.round(totals.fat / servings),
    };
    const { error } = await supabase.from('recipes').update(updates).eq('id', recipeId);
    if (error) {
      console.warn('[recipes] recompute failed:', error.message);
      return;
    }
    set(s => ({
      recipes: s.recipes.map(r => r.id === recipeId ? { ...r, ...updates } : r),
    }));
  },

  reset: () => set({ recipes: [], loading: false }),
}));
