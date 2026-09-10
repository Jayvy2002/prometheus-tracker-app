import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { NutritionLog, WaterLog, FoodProduct, ProductRequest, FoodFavorite, DailySteps } from '../lib/types';
import { todayStr } from '../lib/utils';
import { toast } from '../components/ui/Toast';
import i18n from '../i18n';
import { useStreakStore } from './streakStore';

import { functionsErrorBody, functionsHttpStatus } from '../lib/supabaseFunctions';
import { waitForRowChange } from '../lib/realtimeWait';
import {
  FAST_VERIFY_BONUS_POLL_MS,
  FAST_VERIFY_BONUS_TIMEOUT_MS,
  parseAnalyzeProductResponse,
} from '../lib/fastVerify';
import { correctNutritionLogEnergy, normalizeFoodProductEnergy, rescaleNutritionMacros } from '../lib/foodEnergy';

interface NutritionState {
  logs: NutritionLog[];
  waterLogs: WaterLog[];
  products: FoodProduct[];
  recentProducts: FoodProduct[];
  favorites: FoodFavorite[];
  loading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  fetchLogs: (userId: string, date: string) => Promise<void>;
  addLog: (log: Partial<NutritionLog>) => Promise<{ error: string | null }>;
  updateLog: (id: string, data: Partial<NutritionLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  fetchWaterLogs: (userId: string, date: string) => Promise<void>;
  addWater: (data: Partial<WaterLog>) => Promise<{ error: string | null }>;
  deleteWater: (id: string) => Promise<void>;
  searchProducts: (query: string) => Promise<FoodProduct[]>;
  findByBarcode: (barcode: string) => Promise<FoodProduct | null>;
  createProduct: (product: Partial<FoodProduct>) => Promise<FoodProduct | null>;
  batchSaveProducts: (products: Partial<FoodProduct>[]) => Promise<void>;
  uploadProductImage: (userId: string, file: File, slot: string) => Promise<string | null>;
  createProductRequest: (request: Partial<ProductRequest>) => Promise<ProductRequest | null>;
  analyzeProductRequest: (requestId: string) => Promise<{ product: FoodProduct; confidence: number } | { error: string }>;
  fetchFavorites: (userId: string) => Promise<void>;
  addFavorite: (userId: string, product: FoodProduct) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  fetchRecentProducts: (userId: string) => Promise<void>;
  fetchCaloriesForRange: (userId: string, startDate: string, endDate: string) => Promise<{ logged_at: string; calories: number }[]>;
  stepsLog: DailySteps | null;
  fetchOrCreateSteps: (userId: string, date: string) => Promise<DailySteps | null>;
  logSteps: (userId: string, steps: number, date: string) => Promise<{ error: string | null }>;
  reset: () => void;
}

export const useNutritionStore = create<NutritionState>((set, get) => ({
  logs: [],
  waterLogs: [],
  products: [],
  recentProducts: [],
  favorites: [],
  loading: false,
  selectedDate: todayStr(),
  stepsLog: null,

  setSelectedDate: (date) => set({ selectedDate: date }),

  fetchLogs: async (userId, date) => {
    set({ loading: true });
    const { data } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_at', date)
      .order('created_at', { ascending: true });
    set({ logs: ((data ?? []) as NutritionLog[]).map(correctNutritionLogEnergy), loading: false });
  },

  addLog: async (log) => {
    const { data, error } = await supabase
      .from('nutrition_logs')
      .insert(log)
      .select()
      .maybeSingle();
    if (error || !data) {
      const message = error?.message || i18n.t('errors.saveFailed');
      toast(message, 'error');
      return { error: message };
    }
    const saved = correctNutritionLogEnergy(data as NutritionLog);
    set(s => ({ logs: [...s.logs, saved] }));
    if (saved.user_id && saved.logged_at) {
      void useStreakStore.getState().recordActivity(saved.user_id, saved.logged_at);
    }
    return { error: null };
  },

  updateLog: async (id, updates) => {
    const existing = get().logs.find(l => l.id === id);
    let payload = updates;
    if (existing && (updates.quantity != null || updates.unit != null)) {
      const scaled = rescaleNutritionMacros(existing, {
        quantity: updates.quantity ?? existing.quantity,
        unit: updates.unit ?? existing.unit,
      });
      payload = {
        ...scaled,
        ...updates,
        calories: updates.calories ?? scaled.calories,
        protein: updates.protein ?? scaled.protein,
        carbs: updates.carbs ?? scaled.carbs,
        fat: updates.fat ?? scaled.fat,
      };
    }
    const { error } = await supabase.from('nutrition_logs').update(payload).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    set(s => ({
      logs: s.logs.map(l => l.id === id ? correctNutritionLogEnergy({ ...l, ...payload } as NutritionLog) : l),
    }));
  },

  deleteLog: async (id) => {
    const { error } = await supabase.from('nutrition_logs').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    set(s => ({ logs: s.logs.filter(l => l.id !== id) }));
  },

  fetchWaterLogs: async (userId, date) => {
    const { data } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_at', date)
      .order('created_at', { ascending: true });
    set({ waterLogs: (data ?? []) as WaterLog[] });
  },

  addWater: async (waterLog) => {
    const { data, error } = await supabase
      .from('water_logs')
      .insert(waterLog)
      .select()
      .maybeSingle();
    if (error || !data) {
      const message = error?.message || i18n.t('errors.saveFailed');
      toast(message, 'error');
      return { error: message };
    }
    set(s => ({ waterLogs: [...s.waterLogs, data as WaterLog] }));
    return { error: null };
  },

  deleteWater: async (id) => {
    const { error } = await supabase.from('water_logs').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    set(s => ({ waterLogs: s.waterLogs.filter(w => w.id !== id) }));
  },

  searchProducts: async (query) => {
    // RPC avec index GIN trigram + ranking par similarité de nom uniquement
    const { data } = await supabase
      .rpc('search_food_products', { query, max_results: 30 });
    const products = ((data ?? []) as FoodProduct[]).map(normalizeFoodProductEnergy);
    set({ products });
    return products;
  },

  findByBarcode: async (barcode) => {
    const { data } = await supabase
      .from('food_products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();
    return data ? normalizeFoodProductEnergy(data as FoodProduct) : null;
  },

  createProduct: async (product) => {
    // D05 : la RLS exige created_by=auth.uid() — l'auteur est imposé ici.
    const { data: { user } } = await supabase.auth.getUser();
    const payload = normalizeFoodProductEnergy({
      ...product,
      created_by: product.created_by ?? user?.id ?? null,
      calories_per_100g: product.calories_per_100g ?? 0,
      protein_per_100g: product.protein_per_100g ?? 0,
      carbs_per_100g: product.carbs_per_100g ?? 0,
      fat_per_100g: product.fat_per_100g ?? 0,
    });
    const { data, error } = await supabase
      .from('food_products')
      .insert(payload)
      .select()
      .maybeSingle();

    if (data) return data as FoodProduct;

    // Conflit de barcode (23505 = unique_violation) → retourner le produit existant
    if (product.barcode && error?.code === '23505') {
      const { data: existing } = await supabase
        .from('food_products')
        .select('*')
        .eq('barcode', String(product.barcode))
        .maybeSingle();
      return existing ? normalizeFoodProductEnergy(existing as FoodProduct) : null;
    }

    return null;
  },

  batchSaveProducts: async (products) => {
    // D05 : contribution utilisateur avec auteur imposé ; dédupliquée par
    // barcode (UNIQUE). Les échecs de cache sont journalisés sans casser la saisie.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const toSave = products
      .filter(p => p.barcode)
      .map(p => ({
        barcode: p.barcode,
        name: p.name,
        brand: p.brand ?? null,
        created_by: user.id,
        data_source: 'openfoodfacts',
        calories_per_100g: normalizeFoodProductEnergy({
          calories_per_100g: p.calories_per_100g ?? 0,
          protein_per_100g: p.protein_per_100g ?? 0,
          carbs_per_100g: p.carbs_per_100g ?? 0,
          fat_per_100g: p.fat_per_100g ?? 0,
        }).calories_per_100g,
        protein_per_100g: p.protein_per_100g ?? 0,
        carbs_per_100g: p.carbs_per_100g ?? 0,
        fat_per_100g: p.fat_per_100g ?? 0,
        serving_size: p.serving_size ?? 100,
        serving_unit: p.serving_unit ?? 'g',
      }));
    if (toSave.length === 0) return;
    // ignoreDuplicates: existing barcodes are silently skipped
    const { error } = await supabase.from('food_products').upsert(toSave, { onConflict: 'barcode', ignoreDuplicates: true });
    if (error) console.warn('[nutrition] food cache enrichment failed:', error.message);
  },

  uploadProductImage: async (userId, file, slot) => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${crypto.randomUUID()}_${slot}.${ext}`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { contentType: file.type });
    if (error) return null;
    return path;
  },

  createProductRequest: async (request) => {
    const { data } = await supabase
      .from('product_requests')
      .insert(request)
      .select()
      .maybeSingle();
    return data as ProductRequest | null;
  },

  analyzeProductRequest: async (requestId) => {
    const { data, error } = await supabase.functions.invoke('analyze-product', {
      body: { request_id: requestId },
    });

    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const outcome = parseAnalyzeProductResponse(body, functionsHttpStatus(error));

    if (outcome.kind === 'ready') {
      return {
        product: outcome.product as unknown as FoodProduct,
        confidence: outcome.confidence,
      };
    }
    if (outcome.kind === 'error') {
      if (error) console.error('[analyzeProductRequest] Edge Function error:', error, body);
      return { error: outcome.key };
    }

    // Bonus only: a stale 202 deploy. Primary path is 200 + product id.
    const done = await waitForRowChange<{
      status: string;
      result_product_id: string | null;
      error_message: string | null;
    }>({
      table: 'product_requests',
      filter: `id=eq.${requestId}`,
      timeoutMs: FAST_VERIFY_BONUS_TIMEOUT_MS,
      pollMs: FAST_VERIFY_BONUS_POLL_MS,
      poll: async () => {
        const { data: row } = await supabase
          .from('product_requests')
          .select('status, result_product_id, error_message')
          .eq('id', requestId)
          .maybeSingle();
        return row as { status: string; result_product_id: string | null; error_message: string | null } | null;
      },
      isDone: row => row.status === 'completed' || row.status === 'failed',
    });

    if (done?.status === 'completed' && done.result_product_id) {
      const { data: product } = await supabase
        .from('food_products')
        .select('*')
        .eq('id', done.result_product_id)
        .maybeSingle();
      if (product) {
        return { product: product as FoodProduct, confidence: 100 };
      }
    }
    if (done?.status === 'failed') {
      return { error: 'scanner.aiFailed' };
    }
    return { error: 'scanner.aiTimeout' };
  },

  fetchFavorites: async (userId) => {
    const { data } = await supabase
      .from('food_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    set({ favorites: (data ?? []) as FoodFavorite[] });
  },

  addFavorite: async (userId, product) => {
    const { data } = await supabase
      .from('food_favorites')
      .insert({
        user_id: userId,
        product_id: product.id || null,
        product_name: product.name,
        brand: product.brand ?? '',
        calories_per_100g: product.calories_per_100g,
        protein_per_100g: product.protein_per_100g,
        carbs_per_100g: product.carbs_per_100g,
        fat_per_100g: product.fat_per_100g,
        serving_size: product.serving_size,
        serving_unit: product.serving_unit,
      })
      .select()
      .maybeSingle();
    if (data) {
      set(s => ({ favorites: [data as FoodFavorite, ...s.favorites] }));
    }
  },

  removeFavorite: async (id) => {
    // D03 : ne retire du store qu'après suppression serveur confirmée.
    const { error } = await supabase.from('food_favorites').delete().eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    set(s => ({ favorites: s.favorites.filter(f => f.id !== id) }));
  },

  fetchRecentProducts: async (userId) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .select('name, calories, protein, carbs, fat, quantity, unit')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!data) return;
    const seen = new Set<string>();
    const recent: FoodProduct[] = [];
    for (const raw of data) {
      const log = correctNutritionLogEnergy({
        calories: raw.calories,
        protein: raw.protein,
        carbs: raw.carbs,
        fat: raw.fat,
        quantity: raw.quantity,
        unit: raw.unit,
      });
      if (!seen.has(raw.name)) {
        seen.add(raw.name);
        const qty = log.quantity || 100;
        const scale = 100 / qty;
        recent.push({
          id: '',
          barcode: null,
          name: raw.name,
          brand: null,
          calories_per_100g: Math.round(log.calories * scale),
          protein_per_100g: Math.round(log.protein * scale),
          carbs_per_100g: Math.round(log.carbs * scale),
          fat_per_100g: Math.round(log.fat * scale),
          serving_size: qty,
          serving_unit: log.unit || 'g',
          created_by: null,
          created_at: '',
          data_source: null,
        });
      }
      if (recent.length >= 10) break;
    }
    set({ recentProducts: recent });
  },

  fetchCaloriesForRange: async (userId, startDate, endDate) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .select('logged_at, calories, protein, carbs, fat, quantity, unit')
      .eq('user_id', userId)
      .gte('logged_at', startDate)
      .lte('logged_at', endDate);
    return ((data ?? []) as Array<{
      logged_at: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      quantity: number;
      unit: string;
    }>).map(row => {
      const corrected = correctNutritionLogEnergy(row);
      return { logged_at: row.logged_at, calories: corrected.calories };
    });
  },

  fetchOrCreateSteps: async (userId, date) => {
    const { data } = await supabase
      .from('daily_steps')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_at', date)
      .maybeSingle();
    const row = (data as DailySteps | null) ?? null;
    set({ stepsLog: row });
    return row;
  },

  logSteps: async (userId, steps, date) => {
    const n = Math.max(0, Math.min(100000, Math.round(steps)));
    const { data, error } = await supabase
      .from('daily_steps')
      .upsert({ user_id: userId, steps: n, logged_at: date }, { onConflict: 'user_id,logged_at' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    set({ stepsLog: (data as DailySteps | null) ?? { user_id: userId, steps: n, logged_at: date, id: '', created_at: '' } });
    return { error: null };
  },

  reset: () => set({
    logs: [],
    waterLogs: [],
    products: [],
    recentProducts: [],
    favorites: [],
    loading: false,
    selectedDate: todayStr(),
    stepsLog: null,
  }),
}));
