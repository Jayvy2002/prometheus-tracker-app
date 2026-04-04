import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';

interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  fetchSubscription: (userId: string) => Promise<void>;
  clearSubscription: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  tier: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,

  fetchSubscription: async (userId: string) => {
    set({ loading: true });
    const { data } = await supabase
      .from('subscriptions')
      .select('tier, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      set({
        tier: data.tier as SubscriptionTier,
        status: data.status as SubscriptionStatus,
        currentPeriodEnd: data.current_period_end ?? null,
        cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
        loading: false,
      });
    } else {
      set({ tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, loading: false });
    }
  },

  clearSubscription: () => {
    set({ tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, loading: false });
  },
}));
