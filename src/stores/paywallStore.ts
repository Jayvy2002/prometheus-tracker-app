import { create } from 'zustand';

interface PaywallState {
  isOpen: boolean;
  featureName: string;
  featureDescription: string;
  openPaywall: (featureName: string, featureDescription?: string) => void;
  closePaywall: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  isOpen: false,
  featureName: '',
  featureDescription: '',
  openPaywall: (featureName, featureDescription = '') =>
    set({ isOpen: true, featureName, featureDescription }),
  closePaywall: () => set({ isOpen: false }),
}));
