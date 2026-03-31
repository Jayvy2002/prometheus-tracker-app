import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { WeightMeasurement } from '../lib/types';

interface WeightState {
  measurements: WeightMeasurement[];
  loading: boolean;
  fetchMeasurements: (userId: string) => Promise<void>;
  addMeasurement: (data: Partial<WeightMeasurement>) => Promise<void>;
  updateMeasurement: (id: string, data: Partial<WeightMeasurement>) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<void>;
}

export const useWeightStore = create<WeightState>((set) => ({
  measurements: [],
  loading: false,

  fetchMeasurements: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('weight_measurements')
      .select('*')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false });
    set({ measurements: (data ?? []) as WeightMeasurement[], loading: false });
  },

  addMeasurement: async (measurement) => {
    const { data } = await supabase
      .from('weight_measurements')
      .insert(measurement)
      .select()
      .maybeSingle();
    if (data) {
      set(s => ({ measurements: [data as WeightMeasurement, ...s.measurements] }));
    }
  },

  updateMeasurement: async (id, updates) => {
    await supabase.from('weight_measurements').update(updates).eq('id', id);
    set(s => ({
      measurements: s.measurements.map(m => m.id === id ? { ...m, ...updates } as WeightMeasurement : m),
    }));
  },

  deleteMeasurement: async (id) => {
    await supabase.from('weight_measurements').delete().eq('id', id);
    set(s => ({ measurements: s.measurements.filter(m => m.id !== id) }));
  },
}));
