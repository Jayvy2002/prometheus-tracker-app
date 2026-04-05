import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { AppRole } from '../lib/types';

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';

interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  role: AppRole;
  loading: boolean;
  fetchSubscription: (userId: string) => Promise<void>;
  clearSubscription: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  tier: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  role: 'free',
  loading: true,

  fetchSubscription: async (userId: string) => {
    set({ loading: true });

    try {
      const [{ data: subData }, { data: roleData }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('tier, status, current_period_end, cancel_at_period_end')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      set({
        tier: (subData?.tier as SubscriptionTier) ?? 'free',
        status: (subData?.status as SubscriptionStatus) ?? 'active',
        currentPeriodEnd: subData?.current_period_end ?? null,
        cancelAtPeriodEnd: subData?.cancel_at_period_end ?? false,
        role: (roleData?.role as AppRole) ?? 'free',
        loading: false,
      });
    } catch {
      // Network failure: stay on free tier, don't block the app
      set({ loading: false });
    }
  },

  clearSubscription: () => {
    set({ tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, role: 'free', loading: false });
  },
}));
