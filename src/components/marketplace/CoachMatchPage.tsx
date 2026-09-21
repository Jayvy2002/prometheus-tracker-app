import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import {
  MARKET_DISCIPLINES,
  MARKET_FORMATS,
  MARKET_LANGUAGES,
  MATCH_AUTONOMY,
  MATCH_EXPERIENCE,
  MATCH_FREQUENCIES,
  MATCH_STYLES,
  emptyIntent,
  intentIsReady,
  normalizeSearchIntent,
  type CoachMatchExplanation,
  type MarketplaceSearchIntent,
} from '../../lib/marketplace';
import { explainMarketplaceMatches, marketRpc, readMarketplaceSearchIntent } from '../../lib/marketplaceApi';
import Button from '../ui/Button';
import Input from '../ui/Input';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';

function eurosFromCents(cents: number | null): string {
  return cents == null ? '' : String(Math.round(cents / 100));
}

export default function CoachMatchPage() {
  const { t } = useTranslation();
  const owner = useAuthStore(s => s.user?.id) ?? '';
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [intent, setIntent] = useState<MarketplaceSearchIntent>(emptyIntent);
  const [budgetEuros, setBudgetEuros] = useState('');
  const [matches, setMatches] = useState<Array<CoachMatchExplanation & { public_name?: string }>>([]);
  const [searched, setSearched] = useState(false);
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
    setSearched(false);
    void (async () => {
      const saved = await readMarketplaceSearchIntent(owner);
      if (seq !== sequence.current) return;
      const next = saved ?? emptyIntent;
      setIntent(next);
      setBudgetEuros(eurosFromCents(next.budget_max_cents));
      if (saved && intentIsReady(saved)) {
        const rows = await explainMarketplaceMatches(owner);
        if (seq !== sequence.current) return;
        setMatches(rows.filter(row => row.eligible).slice(0, 5));
        setSearched(true);
      }
      if (seq === sequence.current) setStatus('ready');
    })().catch(() => { if (seq === sequence.current) setStatus('failed'); });
    return () => { sequence.current = seq + 1; };
  }, [owner, revision]);

  function patch(update: Partial<MarketplaceSearchIntent>) {
    setIntent(current => normalizeSearchIntent({ ...current, ...update }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (writing.current) return;
    const seq = sequence.current;
    writing.current = true;
    setBusy(true);
    setError('');
    const parsed = Number(budgetEuros);
    const next = normalizeSearchIntent({
      ...intent,
      budget_max_cents: budgetEuros === '' || !Number.isFinite(parsed) || parsed <= 0 ? null : Math.round(parsed * 100),
    });
    setIntent(next);
    try {
      await marketRpc('save_marketplace_search_intent', { p_intent: next }, owner);
      if (seq !== sequence.current) return;
      const rows = await explainMarketplaceMatches(owner);
      if (seq === sequence.current) {
        setMatches(rows.filter(row => row.eligible).slice(0, 5));
        setSearched(true);
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

  if (status === 'loading') return <div className="mx-auto w-full max-w-5xl p-4 md:p-6 pb-28"><p role="status">{t('marketplace.loading')}</p></div>;
  if (status === 'failed') {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6 pb-28 space-y-3">
        <p role="alert">{t('marketplace.loadError')}</p>
        <Button onClick={() => setRevision(n => n + 1)}>{t('errors.retry')}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6 pb-28 space-y-5">
      <h1 className="text-2xl font-semibold">{t('marketplace.match')}</h1>
      <nav className="flex flex-wrap gap-2">
        <Link className="min-h-11 inline-flex items-center rounded-xl px-3 text-sm bg-neutral-900 text-neutral-300" to="/coaches">{t('marketplace.directory')}</Link>
        <Link aria-current="page" className="min-h-11 inline-flex items-center rounded-xl px-3 text-sm bg-blue-600 text-white" to="/coaches/match">{t('marketplace.match')}</Link>
        <Link className="min-h-11 inline-flex items-center rounded-xl px-3 text-sm bg-neutral-900 text-neutral-300" to="/coaching-requests">{t('marketplace.requests')}</Link>
      </nav>
      <p className="text-sm text-neutral-400">{t('marketplace.matchHelp')}</p>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <form onSubmit={onSubmit} className="space-y-6">
        <fieldset disabled={busy} className="space-y-4">
          <legend className="font-semibold text-white">{t('marketplace.matchBlocking')}</legend>
          {([['discipline', MARKET_DISCIPLINES], ['language', MARKET_LANGUAGES], ['format', MARKET_FORMATS]] as const).map(([key, values]) => (
            <div key={key} className="space-y-2">
              <label htmlFor={`match-${key}`}>{t(`marketplace.${key}`)}</label>
              <select id={`match-${key}`} required className={fieldStyle} value={intent[key]} onChange={e => patch({ [key]: e.target.value })}>
                <option value="">{t('marketplace.any')}</option>
                {values.map(value => <option key={value} value={value}>{t(`marketplace.${value}`)}</option>)}
              </select>
            </div>
          ))}
          {intent.format && intent.format !== 'online' && (
            <Input maxLength={150} label={t('marketplace.area')} value={intent.area} onChange={e => patch({ area: e.target.value })} />
          )}
          <Input inputMode="decimal" label={t('marketplace.budget')} value={budgetEuros} onChange={e => setBudgetEuros(e.target.value)} />
        </fieldset>
        <fieldset disabled={busy} className="space-y-4">
          <legend className="font-semibold text-white">{t('marketplace.matchPreferences')}</legend>
          {([['contact_frequency', MATCH_FREQUENCIES], ['coaching_style', MATCH_STYLES], ['autonomy', MATCH_AUTONOMY], ['experience_level', MATCH_EXPERIENCE]] as const).map(([key, values]) => (
            <div key={key} className="space-y-2">
              <label htmlFor={`match-${key}`}>{t(`marketplace.${key}`)}</label>
              <select id={`match-${key}`} className={fieldStyle} value={intent[key]} onChange={e => patch({ [key]: e.target.value })}>
                <option value="">{t('marketplace.any')}</option>
                {values.map(value => <option key={value} value={value}>{t(`marketplace.${value}`)}</option>)}
              </select>
            </div>
          ))}
        </fieldset>
        <fieldset disabled={busy} className="space-y-2">
          <legend className="font-semibold text-white">{t('marketplace.matchSecondary')}</legend>
          <label className="block space-y-2">{t('marketplace.secondaryNotes')}
            <textarea className={fieldStyle} maxLength={500} rows={3} value={intent.secondary_notes} onChange={e => patch({ secondary_notes: e.target.value })} />
          </label>
        </fieldset>
        <Button type="submit" loading={busy} disabled={!intentIsReady(intent)}>{t('marketplace.findMatches')}</Button>
      </form>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('marketplace.shortlistTitle')}</h2>
        {searched && !matches.length && <p>{t('marketplace.noEligible')}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {matches.map(row => (
            <article key={row.coach_id} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-3">
              <h3 className="text-lg font-semibold text-white">{row.public_name || t('marketplace.coachUnavailableName')}</h3>
              <p className="text-sm text-blue-300">{t('marketplace.whyRecommended')}</p>
              {row.matched_requirements.length > 0 && (
                <p className="text-sm text-neutral-300">{t('marketplace.matchedRequirements')}: {row.matched_requirements.map(key => t(`marketplace.${key}`)).join(' · ')}</p>
              )}
              {row.matched_preferences.length > 0 && (
                <p className="text-sm text-neutral-300">{t('marketplace.matchedPreferences')}: {row.matched_preferences.map(key => t(`marketplace.${key}`)).join(' · ')}</p>
              )}
              {row.missing_information.length > 0 && (
                <p className="text-sm text-neutral-400">{t('marketplace.missingInformation')}: {row.missing_information.map(key => t(`marketplace.missing_${key}`)).join(' · ')}</p>
              )}
              <Link className="inline-flex min-h-11 items-center text-blue-400 underline" to={`/coaches/${row.coach_id}`}>{t('marketplace.viewCoach')}</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
