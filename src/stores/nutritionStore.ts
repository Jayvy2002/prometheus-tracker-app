import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { NutritionLog, WaterLog, FoodProduct, ProductRequest, FoodFavorite, DailySteps } from '../lib/types';
import { todayStr } from '../lib/utils';

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
  uploadProductImage: (userId: string, file: File, slot: string) => Promise<string | null>;
  createProductRequest: (request: Partial<ProductRequest>) => Promise<ProductRequest | null>;
  analyzeProductRequest: (requestId: string) => Promise<{ product: FoodProduct; confidence: number } | null>;
  fetchFavorites: (userId: string) => Promise<void>;
  addFavorite: (userId: string, product: FoodProduct) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  fetchRecentProducts: (userId: string) => Promise<void>;
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
    await supabase.from('nutrition_logs').update(updates).eq('id', id);
    set(s => ({
      logs: s.logs.map(l => l.id === id ? { ...l, ...updates } as NutritionLog : l),
    }));
  },

  deleteLog: async (id) => {
    await supabase.from('nutrition_logs').delete().eq('id', id);
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
    await supabase.from('water_logs').delete().eq('id', id);
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-product`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId }),
    });

    if (!res.ok) return null;
    const result = await res.json();
    if (!result.product) return null;
    return {
      product: result.product as FoodProduct,
      confidence: typeof result.confidence === 'number' ? result.confidence : 100,
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
