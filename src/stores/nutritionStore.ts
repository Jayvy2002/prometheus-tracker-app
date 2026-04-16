import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { NutritionLog, WaterLog, FoodProduct, ProductRequest, FoodFavorite, DailySteps } from '../lib/types';
import { todayStr } from '../lib/utils';
import { toast } from '../components/ui/Toast';

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
  batchSaveProducts: (products: Partial<FoodProduct>[], userId: string) => Promise<void>;
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
      set(s => ({ logs: [...s.logs, data as NutritionLog] }));
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

    console.error('[createProduct] Insert failed:', error?.code, error?.message);
    return null;
  },

  batchSaveProducts: async (products, userId) => {
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
        created_by: userId,
      }));
    if (toSave.length === 0) return;
    // ignoreDuplicates: existing barcodes are silently skipped
    const { error } = await supabase.from('food_products').upsert(toSave, { onConflict: 'barcode', ignoreDuplicates: true });
    if (error) console.error('[batchSaveProducts] Upsert failed:', error.code, error.message);
  },

  uploadProductImage: async (userId, file, slot) => {
    // Normalize MIME type — camera photos from iOS may have empty or HEIC type.
    // compressImage() in UnifiedScanner already converts everything to image/jpeg,
    // but we keep this fallback in case the function is called with a raw file.
    const mimeType = file.type && file.type !== 'application/octet-stream'
      ? file.type
      : 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png'
      : mimeType.includes('webp') ? 'webp'
      : 'jpg';
    const path = `${userId}/${crypto.randomUUID()}_${slot}.${ext}`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { contentType: mimeType });
    if (error) {
      console.error('[uploadProductImage] Upload failed:', error.message);
      return null;
    }
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
    // Use supabase.functions.invoke() — automatically adds Authorization + apikey headers
    const { data, error } = await supabase.functions.invoke('analyze-product', {
      body: { request_id: requestId },
    });

    if (error) {
      console.error('[analyzeProductRequest] Edge Function error:', error);
      return { error: 'scanner.aiStartError' };
    }
    if (!data?.product) {
      console.error('[analyzeProductRequest] No product in response:', data);
      const errCode = (data?.error as string) ?? '';
      if (errCode === 'DAILY_LIMIT_REACHED') return { error: 'scanner.dailyLimitReached' };
      return { error: 'scanner.aiStartError' };
    }
    return {
      product: data.product as FoodProduct,
      confidence: typeof data.confidence === 'number' ? data.confidence : 100,
    };
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
