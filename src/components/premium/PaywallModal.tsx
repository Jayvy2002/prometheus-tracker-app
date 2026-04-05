import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, X, Check, Zap, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePaywallStore } from '../../stores/paywallStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';

const MONTHLY_PRICE = import.meta.env.VITE_STRIPE_MONTHLY_PRICE ?? '9,99 $';
const ANNUAL_PRICE = import.meta.env.VITE_STRIPE_ANNUAL_PRICE ?? '79,99 $';

export default function PaywallModal() {
  const { t } = useTranslation();
  const { isOpen, featureName, featureDescription, closePaywall } = usePaywallStore();
  const { role } = useSubscriptionStore();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admins bypass the paywall entirely
  if (!isOpen || role === 'admin') return null;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(t('premium.notAuthenticated')); setLoading(false); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ billing_cycle: billingCycle }),
        },
      );

      const json = await res.json();
      if (json.error || !json.url) {
        setError(t('premium.redirectError'));
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(t('premium.networkError'));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={closePaywall}
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-neutral-950 border border-neutral-800/60 rounded-3xl overflow-hidden animate-modal-pop shadow-2xl">

          {/* Header */}
          <div className="relative bg-gradient-to-b from-amber-500/8 to-transparent px-5 pt-6 pb-4">
            <button
              onClick={closePaywall}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-neutral-800/80 flex items-center justify-center hover:bg-neutral-700 transition-colors"
            >
              <X size={13} className="text-neutral-400" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3">
              <Crown size={22} className="text-amber-400" />
            </div>

            <h2 className="text-xl font-bold text-white leading-tight">
              {featureName ? t('premium.unlock', { name: featureName }) : t('premium.upgradeToPremium')}
            </h2>
            {featureDescription && (
              <p className="text-sm text-neutral-400 mt-1 leading-snug">{featureDescription}</p>
            )}
          </div>

          {/* Features list */}
          <div className="px-5 pb-2">
            <div className="space-y-2 mb-5">
              {(['unlimitedWidgets', 'unlimitedHistory', 'unlimitedRoutines', 'advancedStats', 'weightChart', 'pushNotifications'] as const).map(key => (
                <div key={key} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={10} className="text-emerald-400" />
                  </div>
                  <p className="text-sm text-neutral-300">{t(`premium.features.${key}`)}</p>
                </div>
              ))}
            </div>

            {/* Billing toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`flex-1 py-3 rounded-xl border text-center transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                }`}
              >
                <div className="text-base font-bold">{MONTHLY_PRICE}</div>
                <div className="text-xs opacity-70 mt-0.5">{t('premium.perMonth')}</div>
              </button>

              <button
                onClick={() => setBillingCycle('annual')}
                className={`flex-1 py-3 rounded-xl border text-center relative transition-all ${
                  billingCycle === 'annual'
                    ? 'bg-neutral-800 border-amber-500/50 text-white'
                    : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                }`}
              >
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold tracking-wide whitespace-nowrap">
                  {t('premium.discount')}
                </div>
                <div className="text-base font-bold">{ANNUAL_PRICE}</div>
                <div className="text-xs opacity-70 mt-0.5">{t('premium.perYear')}</div>
              </button>
            </div>

            {error && (
              <p className="text-xs text-rose-400 mb-3 text-center">{error}</p>
            )}

            {/* CTA */}
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 mb-2"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Zap size={15} fill="currentColor" />
              )}
              {loading ? t('premium.redirecting') : t('premium.upgradeToPremium')}
            </button>

            <button
              onClick={closePaywall}
              className="w-full py-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors mb-1"
            >
              {t('premium.maybeLater')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
