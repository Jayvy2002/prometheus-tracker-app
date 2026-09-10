import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { WeightMeasurement } from '../lib/types';
import { useProfileStore } from './profileStore';
import { useStreakStore } from './streakStore';
import { parseDate, toLocalDateStr } from '../lib/utils';
import { toast } from '../components/ui/Toast';
import i18n from '../i18n';

interface WeightState {
  measurements: WeightMeasurement[];
  loading: boolean;
  fetchMeasurements: (userId: string) => Promise<void>;
  addMeasurement: (data: Partial<WeightMeasurement>) => Promise<{ error: string | null }>;
  updateMeasurement: (id: string, data: Partial<WeightMeasurement>) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<void>;
  reset: () => void;
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
    const { data, error } = await supabase
      .from('weight_measurements')
      .insert(measurement)
      .select()
      .maybeSingle();
    if (error || !data) {
      const message = error?.message || i18n.t('errors.saveFailed');
      toast(message, 'error');
      return { error: message };
    }
    const newMeasurement = data as WeightMeasurement;
    set(s => ({ measurements: [newMeasurement, ...s.measurements] }));

    if (newMeasurement.user_id && newMeasurement.weight_kg != null) {
      // D03 : la pesée est sauvée ; le miroir profil est best-effort mais tracé.
      const mirrored = await useProfileStore.getState().updateProfile(newMeasurement.user_id, {
        weight_kg: newMeasurement.weight_kg,
      });
      if (mirrored.error) console.warn('[weight] profile mirror failed:', mirrored.error);
      void useStreakStore.getState().recordActivity(
        newMeasurement.user_id,
        toLocalDateStr(parseDate(newMeasurement.measured_at)),
      );
    }
    return { error: null };
  },

  updateMeasurement: async (id, updates) => {
    const { error } = await supabase.from('weight_measurements').update(updates).eq('id', id);
    if (error) { console.error('updateMeasurement failed:', error.message); return; }
    set(s => ({
      measurements: s.measurements.map(m => m.id === id ? { ...m, ...updates } as WeightMeasurement : m),
    }));
  },

  deleteMeasurement: async (id) => {
    const { error } = await supabase.from('weight_measurements').delete().eq('id', id);
    if (error) { console.error('deleteMeasurement failed:', error.message); return; }
    set(s => ({ measurements: s.measurements.filter(m => m.id !== id) }));
  },

  reset: () => set({ measurements: [], loading: false }),
}));
