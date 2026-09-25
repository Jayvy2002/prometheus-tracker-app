import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  MARKET_BETA_CURRENCIES,
  MARKET_DISCIPLINES,
  MARKET_FORMATS,
  MARKET_LANGUAGES,
  MATCH_AUTONOMY,
  MATCH_EXPERIENCE,
  MATCH_FREQUENCIES,
  MATCH_PRICE_PERIODS,
  MATCH_STYLES,
  emptyIntent,
  intentIsReady,
  normalizeIsoCurrency,
  normalizeSearchIntent,
  type CoachMatchExplanation,
  type MarketplaceSearchIntent,
} from '../../lib/marketplace';
import { explainMarketplaceMatches, marketRpc, readMarketplaceSearchIntent } from '../../lib/marketplaceApi';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ChipGroup from './ChipGroup';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';
type Step = 1 | 2 | 3 | 'results';

function amountFromCents(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/**
 * Guided search: needs that block (discipline, format, language, place),
 * then optional preferences and budget, then an explained shortlist.
 * No compatibility percentage: each coach says which needs it meets.
 */
export default function CoachMatchPage() {
  const { t } = useTranslation();
  const owner = useAuthStore(s => s.user?.id) ?? '';
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [intent, setIntent] = useState<MarketplaceSearchIntent>(emptyIntent);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [matches, setMatches] = useState<Array<CoachMatchExplanation & { public_name?: string }>>([]);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const writing = useRef(false);

  useEffect(() => {
    const seq = ++sequence.current;
    writing.current = false;
    setBusy(false);
    setStatus('loading');
    setError('');
    setMatches([]);
    setStep(1);
    void (async () => {
      const saved = await readMarketplaceSearchIntent(owner);
      if (seq !== sequence.current) return;
      const next = saved ?? emptyIntent;
      setIntent(next);
      setBudgetAmount(amountFromCents(next.budget_max_cents));
      if (saved && intentIsReady(saved)) {
        const rows = await explainMarketplaceMatches(owner);
        if (seq !== sequence.current) return;
        setMatches(rows.filter(row => row.eligible).slice(0, 5));
        setStep('results');
      }
      if (seq === sequence.current) setStatus('ready');
    })().catch(() => { if (seq === sequence.current) setStatus('failed'); });
    return () => { sequence.current = seq + 1; };
  }, [owner, revision]);

  function patch(update: Partial<MarketplaceSearchIntent>) {
    setIntent(current => normalizeSearchIntent({ ...current, ...update }));
  }

  async function search() {
    if (writing.current) return;
    const seq = sequence.current;
    writing.current = true;
    setBusy(true);
    setError('');
    const parsed = Number(budgetAmount.replace(',', '.'));
    const next = normalizeSearchIntent({
      ...intent,
      budget_max_cents: budgetAmount === '' || !Number.isFinite(parsed) || parsed <= 0 ? null : Math.round(parsed * 100),
      budget_currency: normalizeIsoCurrency(intent.budget_currency),
    });
    setIntent(next);
    try {
      await marketRpc('save_marketplace_search_intent', { p_intent: next }, owner);
      if (seq !== sequence.current) return;
      const rows = await explainMarketplaceMatches(owner);
      if (seq === sequence.current) {
        setMatches(rows.filter(row => row.eligible).slice(0, 5));
        setStep('results');
      }
    } catch (cause) {
      if (seq === sequence.current) {
        const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
        const key = ['intent_incomplete', 'no_search_intent', 'session_changed'].includes(message) ? message : 'saveError';
        setError(t(`marketplace.${key}`));
      }
    } finally {
      if (seq === sequence.current) {
        writing.current = false;
        setBusy(false);
      }
    }
  }

  const options = (values: readonly string[]) => values.map(value => ({ value, label: t(`marketplace.${value}`) }));
  // Say what matched (« Musculation »), not which field (« Discipline »).
  const matchLabel = (key: string): string => {
    if (key === 'area') return intent.area_city || t('marketplace.area');
    const value = (intent as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' && value ? t(`marketplace.${value}`) : t(`marketplace.${key}`);
  };
  const inPerson = !!intent.format && intent.format !== 'online';
  const shell = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28 md:p-6">
      <Link to="/coaches" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" />{t('marketplace.backToCoaches')}
      </Link>
      <h1 className="text-2xl font-semibold text-white">{t('marketplace.match')}</h1>
      {children}
    </div>
  );

  if (status === 'loading') return shell(<p role="status" className="text-sm text-neutral-400">{t('marketplace.loading')}</p>);
  if (status === 'failed') {
    return shell(
      <div className="space-y-3">
        <p role="alert">{t('marketplace.loadError')}</p>
        <Button onClick={() => setRevision(n => n + 1)}>{t('errors.retry')}</Button>
      </div>,
    );
  }

  if (step === 'results') {
    return shell(
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{t('marketplace.shortlistTitle')}</h2>
          <Button variant="ghost" size="sm" onClick={() => setStep(1)}>{t('marketplace.editCriteria')}</Button>
        </div>
        {!matches.length && (
          <div className="space-y-3 rounded-2xl border border-neutral-800 p-5">
            <p className="text-sm text-neutral-300">{t('marketplace.noEligible')}</p>
            <Link to="/coaches" className="inline-flex min-h-11 items-center text-sm text-blue-300 hover:text-white">{t('marketplace.directory')}</Link>
          </div>
        )}
        <div className="space-y-3">
          {matches.map(row => (
            <article key={row.coach_id} className="relative space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 hover:border-line-strong">
              <h3 className="text-base font-semibold text-white">
                <Link to={`/coaches/${row.coach_id}`} className="after:absolute after:inset-0 after:rounded-2xl">
                  {row.public_name || t('marketplace.coachUnavailableName')}
                </Link>
              </h3>
              <p className="text-xs text-blue-300">{t('marketplace.whyRecommended')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {[...row.matched_requirements, ...row.matched_preferences].map(key => (
                  <li key={key} className="inline-flex items-center gap-1 rounded-full bg-blue-600/15 px-2.5 py-1 text-xs text-blue-200">
                    <Check size={12} aria-hidden="true" />{matchLabel(key)}
                  </li>
                ))}
              </ul>
              {row.missing_information.length > 0 && (
                <p className="text-xs text-neutral-500">{t('marketplace.missingInformation')} : {row.missing_information.map(key => t(`marketplace.missing_${key}`)).join(' · ')}</p>
              )}
              <p className="flex items-center gap-1 text-sm text-blue-300">{t('marketplace.viewCoach')}<ArrowRight size={14} aria-hidden="true" /></p>
            </article>
          ))}
        </div>
      </section>,
    );
  }

  const stepReady = step !== 1 || intentIsReady(intent);
  return shell(
    <form
      className="space-y-6"
      onSubmit={event => {
        event.preventDefault();
        if (step === 3) void search();
        else if (stepReady) setStep((step + 1) as Step);
      }}
    >
      <div className="space-y-2">
        <p className="text-xs text-neutral-500">{t('marketplace.stepOf', { n: step })}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map(n => <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-blue-500' : 'bg-neutral-800'}`} />)}
        </div>
        <h2 className="text-lg font-semibold text-white">{t(`marketplace.step${step}Title`)}</h2>
        <p className="text-sm text-neutral-400">{t(`marketplace.step${step}Hint`)}</p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

      <fieldset disabled={busy} className="space-y-5">
        {step === 1 && (
          <>
            <ChipGroup label={t('marketplace.discipline')} options={options(MARKET_DISCIPLINES)} value={intent.discipline} onChange={value => patch({ discipline: value })} />
            <ChipGroup label={t('marketplace.format')} options={options(MARKET_FORMATS)} value={intent.format} onChange={value => patch({ format: value })} />
            <ChipGroup label={t('marketplace.language')} options={options(MARKET_LANGUAGES)} value={intent.language} onChange={value => patch({ language: value })} />
            {inPerson && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Input required maxLength={80} label={t('marketplace.area_city')} value={intent.area_city} onChange={e => patch({ area_city: e.target.value })} />
                <Input maxLength={80} label={t('marketplace.area_region')} value={intent.area_region} onChange={e => patch({ area_region: e.target.value })} />
                <Input required maxLength={80} label={t('marketplace.area_country')} value={intent.area_country} onChange={e => patch({ area_country: e.target.value })} />
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <ChipGroup allowEmpty label={t('marketplace.contact_frequency')} options={options(MATCH_FREQUENCIES)} value={intent.contact_frequency} onChange={value => patch({ contact_frequency: value })} />
            <ChipGroup allowEmpty label={t('marketplace.coaching_style')} options={options(MATCH_STYLES)} value={intent.coaching_style} onChange={value => patch({ coaching_style: value })} />
            <ChipGroup allowEmpty label={t('marketplace.autonomy')} options={options(MATCH_AUTONOMY)} value={intent.autonomy} onChange={value => patch({ autonomy: value })} />
            <ChipGroup allowEmpty label={t('marketplace.experience_level')} options={options(MATCH_EXPERIENCE)} value={intent.experience_level} onChange={value => patch({ experience_level: value })} />
          </>
        )}
        {step === 3 && (
          <>
            <Input inputMode="decimal" label={t('marketplace.budget')} value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} />
            <ChipGroup allowEmpty label={t('marketplace.budget_period')} options={options(MATCH_PRICE_PERIODS.filter(value => value !== 'on_request'))} value={intent.budget_period} onChange={value => patch({ budget_period: value })} />
            <ChipGroup allowEmpty label={t('marketplace.budget_currency')} options={MARKET_BETA_CURRENCIES.map(value => ({ value, label: value }))} value={intent.budget_currency} onChange={value => patch({ budget_currency: value })} />
            <label className="block space-y-2 text-sm text-neutral-300">{t('marketplace.secondaryNotes')}
              <textarea className={fieldStyle} maxLength={500} rows={3} value={intent.secondary_notes} onChange={e => patch({ secondary_notes: e.target.value })} />
            </label>
          </>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {step !== 1 && (
          <Button type="button" variant="ghost" onClick={() => setStep((step - 1) as Step)}>{t('common.back')}</Button>
        )}
        <Button type="submit" loading={busy} disabled={!stepReady}>
          {step === 3 ? t('marketplace.findMatches') : t('marketplace.nextStep')}
        </Button>
        {step !== 1 && step !== 3 && (
          <Button type="button" variant="ghost" onClick={() => setStep((step + 1) as Step)}>{t('marketplace.skip')}</Button>
        )}
      </div>
    </form>,
  );
}
