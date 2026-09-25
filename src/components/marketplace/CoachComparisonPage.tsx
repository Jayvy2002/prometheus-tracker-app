import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { ArrowLeft } from 'lucide-react';
import { comparisonIds, type CoachPublicProfile } from '../../lib/marketplace';
import { coachFormatLine, listedRateLabel } from './marketplaceCopy';
import Button from '../ui/Button';

export default function CoachComparisonPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const ids = comparisonIds(params).join(',');
  const owner = useAuthStore(s => s.user?.id);
  const scope = `${owner}:${ids}`;
  const [result, setResult] = useState<{ scope: string; rows: CoachPublicProfile[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (!owner || !ids) return;
    void (async () => {
      const { data, error } = await supabase.from('coach_profiles').select('*').in('coach_id', ids.split(',')).eq('published', true);
      if (error) throw error;
      if (!cancelled) setResult({ scope, rows: data ?? [], error: false });
    })().catch(() => { if (!cancelled) setResult({ scope, rows: [], error: true }); });
    return () => { cancelled = true; };
  }, [owner, ids, scope, retry]);
  const current = result?.scope === scope ? result : null;
  const rows = ids.split(',').map(id => current?.rows.find(row => row.coach_id === id)).filter((row): row is CoachPublicProfile => !!row);
  return <div className="mx-auto w-full max-w-5xl p-4 md:p-6 pb-28 space-y-5">
    <Link className="inline-flex min-h-11 items-center gap-1.5 text-sm text-neutral-400 hover:text-white" to={`/coaches?${params}`}>
      <ArrowLeft size={16} aria-hidden="true" />{t('marketplace.backToCoaches')}
    </Link>
    <h1 className="text-2xl font-semibold text-white">{t('marketplace.compare')}</h1>
    <p className="text-sm text-neutral-400">{t('marketplace.comparisonDisclosure')}</p>
    {!ids ? <p>{t('marketplace.chooseComparison')}</p> : !current ? <p role="status">{t('marketplace.loading')}</p> : current.error ? <div className="space-y-3">
      <p role="alert">{t('marketplace.loadError')}</p><Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>
    </div> : <>
      {rows.length < ids.split(',').length && <p role="status">{t('marketplace.comparisonUnavailable')}</p>}
      {!!rows.length && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(row => (
          <article key={row.coach_id} className="relative rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-3 hover:border-[#525252]">
            <h2 className="text-lg font-semibold text-white">
              <Link to={`/coaches/${row.coach_id}?${params}`} className="after:absolute after:inset-0 after:rounded-2xl">{row.public_name}</Link>
            </h2>
            <p className="text-sm text-neutral-400">{row.disciplines.map(v => t(`marketplace.${v}`)).join(' · ')}</p>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-neutral-500">{t('marketplace.fact_format')}</dt><dd className="text-neutral-200">{coachFormatLine(t, row)}</dd></div>
              <div><dt className="text-xs text-neutral-500">{t('marketplace.fact_price')}</dt><dd className="text-neutral-200">{listedRateLabel(t, row)}</dd></div>
              <div><dt className="text-xs text-neutral-500">{t('marketplace.method')}</dt><dd className="text-neutral-300 line-clamp-4">{row.method || t('marketplace.notProvided')}</dd></div>
              <div><dt className="text-xs text-neutral-500">{t('marketplace.introduction')}</dt><dd className="text-neutral-300 line-clamp-4">{row.introduction || t('marketplace.notProvided')}</dd></div>
            </dl>
            <p className="text-xs text-neutral-500">{t(row.accepting_clients ? 'marketplace.available' : 'marketplace.unavailable')}</p>
          </article>
        ))}
      </div>}
    </>}
  </div>;
}
