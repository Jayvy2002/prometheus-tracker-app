import i18next, { type TFunction } from 'i18next';
import { blankMatchProfile, listedRateCopy, type CoachPublicProfile, type CoachingRequest } from '../../lib/marketplace';

type T = TFunction<'translation', undefined>;

/** Money in the reader's language: « 120,00 $ CA » in French, « CA$120.00 » in English. */
export function formatListedAmount(amount: string, currency: string, lang: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  const locale = lang.startsWith('fr') ? 'fr-CA' : 'en-CA';
  try {
    return currency
      ? new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
      : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency ? `${amount} ${currency}` : amount;
  }
}

/** « 120,00 $ CA / mois », or « Tarif à convenir » when the coach listed none. Never a payment. */
export function listedRateLabel(t: T, profile: CoachPublicProfile, lang: string = i18next.language || 'fr'): string {
  const rate = listedRateCopy(blankMatchProfile(profile));
  if (!rate) return t('marketplace.priceOnRequest');
  const period = t(`marketplace.pricePeriod_${rate.period}`);
  return t('marketplace.listedPriceNoCurrency', { amount: formatListedAmount(rate.amount, rate.currency, lang), period });
}

export function coachFormatLine(t: T, profile: CoachPublicProfile): string {
  return [
    profile.formats.map(v => t(`marketplace.${v}`)).join(' · '),
    profile.languages.map(v => t(`marketplace.${v}`)).join(' / '),
  ].filter(Boolean).join(' · ');
}

/** Three steps an athlete's request goes through; closed requests have none. */
export type RequestStep = 'sent' | 'accepted' | 'confirmed';
export const REQUEST_STEPS: readonly RequestStep[] = ['sent', 'accepted', 'confirmed'];

export function requestStep(status: CoachingRequest['status']): RequestStep | null {
  if (status === 'pending') return 'sent';
  if (status === 'coach_accepted') return 'accepted';
  if (status === 'athlete_confirmed' || status === 'accepted') return 'confirmed';
  return null;
}

/** Requests still waiting on someone: the ones worth showing first. */
export function isOpenRequest(status: CoachingRequest['status']): boolean {
  return status === 'pending' || status === 'coach_accepted';
}
