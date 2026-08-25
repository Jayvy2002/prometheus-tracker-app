import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { NutritionLog, WaterLog, FoodProduct, ProductRequest, FoodFavorite, DailySteps } from '../lib/types';
import { todayStr } from '../lib/utils';
import { toast } from '../components/ui/Toast';
import { useStreakStore } from './streakStore';

const ANALYZE_POLL_MS = 2_000;
const ANALYZE_TIMEOUT_MS = 90_000;

/** supabase.functions.invoke leaves 4xx/5xx JSON on error.context (a Response), not in data. */
async function functionsErrorBody(error: unknown): Promise<Record<string, unknown>> {
  if (!error || typeof error !== 'object' || !('context' in error)) return {};
  const ctx = (error as { context: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    try {
      const parsed: unknown = await ctx.clone().json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    return ctx as Record<string, unknown>;
  }
  return {};
}

function functionsHttpStatus(error: unknown): number {
  if (!error || typeof error !== 'object' || !('context' in error)) return 0;
  const ctx = (error as { context: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) return ctx.status;
  return 0;
}

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
  addLog: (log: Partial<NutritionLog>) => Promise<void>;
  updateLog: (id: string, data: Partial<NutritionLog>) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  fetchWaterLogs: (userId: string, date: string) => Promise<void>;
  addWater: (data: Partial<WaterLog>) => Promise<void>;
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
  fetchOrCreateSteps: (userId: string, date: string) => Promise<DailySteps | null>;
  logSteps: (userId: string, steps: number, date: string) => Promise<void>;
}

export const useNutritionStore = create<NutritionState>((set) => ({
  logs: [],
  waterLogs: [],
  products: [],
  recentProducts: [],
  favorites: [],
  loading: false,
  selectedDate: todayStr(),

  setSelectedDate: (date) => set({ selectedDate: date }),

  fetchLogs: async (userId, date) => {
    set({ loading: true });
    const { data } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_at', date)
      .order('created_at', { ascending: true });
    set({ logs: (data ?? []) as NutritionLog[], loading: false });
  },

  addLog: async (log) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .insert(log)
      .select()
      .maybeSingle();
    if (data) {
      const log = data as NutritionLog;
      set(s => ({ logs: [...s.logs, log] }));
      if (log.user_id && log.logged_at) {
        void useStreakStore.getState().recordActivity(log.user_id, log.logged_at);
      }
    }
  },

  updateLog: async (id, updates) => {
    const { error } = await supabase.from('nutrition_logs').update(updates).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    set(s => ({
      logs: s.logs.map(l => l.id === id ? { ...l, ...updates } as NutritionLog : l),
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
    const { data } = await supabase
      .from('water_logs')
      .insert(waterLog)
      .select()
      .maybeSingle();
    if (data) {
      set(s => ({ waterLogs: [...s.waterLogs, data as WaterLog] }));
    }
  },

  deleteWater: async (id) => {
    const { error } = await supabase.from('water_logs').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    set(s => ({ waterLogs: s.waterLogs.filter(w => w.id !== id) }));
  },

  searchProducts: async (query) => {
    // RPC avec index GIN trigram + ranking par similarité de nom uniquement
    const { data } = await supabase
      .rpc('search_food_products', { query, max_results: 20 });
    const products = (data ?? []) as FoodProduct[];
    set({ products });
    return products;
  },

  findByBarcode: async (barcode) => {
    const { data } = await supabase
      .from('food_products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();
    return data as FoodProduct | null;
  },

  createProduct: async (product) => {
    const { data, error } = await supabase
      .from('food_products')
      .insert(product)
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
      return existing as FoodProduct | null;
    }

    return null;
  },

  batchSaveProducts: async (products) => {
    const toSave = products
      .filter(p => p.barcode)
      .map(p => ({
        barcode: p.barcode,
        name: p.name,
        brand: p.brand ?? null,
        calories_per_100g: p.calories_per_100g ?? 0,
        protein_per_100g: p.protein_per_100g ?? 0,
        carbs_per_100g: p.carbs_per_100g ?? 0,
        fat_per_100g: p.fat_per_100g ?? 0,
        serving_size: p.serving_size ?? 100,
        serving_unit: p.serving_unit ?? 'g',
        data_source: 'openfoodfacts',
      }));
    if (toSave.length === 0) return;
    // ignoreDuplicates: existing barcodes are silently skipped
    await supabase.from('food_products').upsert(toSave, { onConflict: 'barcode', ignoreDuplicates: true });
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
    const errCode = typeof body.error === 'string' ? body.error : '';
    const httpStatus = functionsHttpStatus(error);
    const errorMessage = error instanceof Error ? error.message : '';

    if (
      errCode === 'DAILY_LIMIT_REACHED'
      || httpStatus === 429
      || errorMessage.includes('DAILY_LIMIT_REACHED')
    ) {
      return { error: 'scanner.dailyLimitReached' };
    }
    if (errCode === 'WEBHOOK_NOT_CONFIGURED') {
      return { error: 'scanner.webhookNotConfigured' };
    }
    if (errCode === 'WEBHOOK_FAILED' || httpStatus === 502) {
      return { error: 'scanner.webhookFailed' };
    }
    if (error && body.status !== 'processing') {
      console.error('[analyzeProductRequest] Edge Function error:', error, body);
      return { error: 'scanner.aiStartError' };
    }
    if (body.status !== 'processing' && body.status !== 'completed') {
      console.error('[analyzeProductRequest] Unexpected response:', body);
      return { error: 'scanner.aiStartError' };
    }

    const deadline = Date.now() + ANALYZE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { data: row } = await supabase
        .from('product_requests')
        .select('status, result_product_id, error_message')
        .eq('id', requestId)
        .maybeSingle();

      if (row?.status === 'completed' && row.result_product_id) {
        const { data: product } = await supabase
          .from('food_products')
          .select('*')
          .eq('id', row.result_product_id)
          .maybeSingle();
        if (product) {
          return { product: product as FoodProduct, confidence: 100 };
        }
        // Product row may not be visible yet — keep polling until timeout.
      } else if (row?.status === 'failed') {
        const msg = typeof row.error_message === 'string' ? row.error_message.trim() : '';
        if (msg === 'WEBHOOK_NOT_CONFIGURED') return { error: 'scanner.webhookNotConfigured' };
        if (msg.startsWith('WEBHOOK_FAILED')) return { error: 'scanner.webhookFailed' };
        return { error: 'scanner.aiFailed' };
      }

      await new Promise(resolve => setTimeout(resolve, ANALYZE_POLL_MS));
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
    await supabase.from('food_favorites').delete().eq('id', id);
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
    for (const log of data) {
      if (!seen.has(log.name)) {
        seen.add(log.name);
        const qty = log.quantity || 100;
        const scale = 100 / qty;
        recent.push({
          id: '',
          barcode: null,
          name: log.name,
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
      .select('logged_at, calories')
      .eq('user_id', userId)
      .gte('logged_at', startDate)
      .lte('logged_at', endDate);
    return (data ?? []) as { logged_at: string; calories: number }[];
  },

  fetchOrCreateSteps: async (userId, date) => {
    const { data } = await supabase
      .from('daily_steps')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_at', date)
      .maybeSingle();
    return (data as DailySteps | null);
  },

  logSteps: async (userId, steps, date) => {
    await supabase
      .from('daily_steps')
      .upsert({ user_id: userId, steps, logged_at: date }, { onConflict: 'user_id,logged_at' });
  },
}));
