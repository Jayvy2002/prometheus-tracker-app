import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { WeightMeasurement } from '../lib/types';
import { useProfileStore } from './profileStore';

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
      const newMeasurement = data as WeightMeasurement;
      set(s => ({ measurements: [newMeasurement, ...s.measurements] }));

      // Keep user_profiles.weight_kg in sync with the latest measurement
      if (newMeasurement.user_id && newMeasurement.weight_kg != null) {
        await useProfileStore.getState().updateProfile(newMeasurement.user_id, {
          weight_kg: newMeasurement.weight_kg,
        });
      }
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
