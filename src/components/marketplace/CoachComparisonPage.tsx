import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { comparisonIds, type CoachPublicProfile } from '../../lib/marketplace';
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
  return <div className="p-4 md:p-6 pb-28 space-y-5">
    <h1 className="text-2xl font-semibold">{t('marketplace.compare')}</h1>
    <Link className="inline-flex min-h-11 items-center text-blue-400 underline" to={`/coaches?${params}`}>{t('marketplace.directory')}</Link>
    {!ids ? <p>{t('marketplace.chooseComparison')}</p> : !current ? <p role="status">{t('marketplace.loading')}</p> : current.error ? <div className="space-y-3">
      <p role="alert">{t('marketplace.loadError')}</p><Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>
    </div> : <>
      {rows.length < ids.split(',').length && <p role="status">{t('marketplace.comparisonUnavailable')}</p>}
      {!!rows.length && <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-neutral-400 text-left">{t('marketplace.comparisonDisclosure')}</caption>
          <thead><tr><th scope="col" className="p-3">{t('marketplace.detail')}</th>{rows.map(row => <th scope="col" className="p-3 min-w-52" key={row.coach_id}>{row.public_name}</th>)}</tr></thead>
          <tbody>
            {(['introduction', 'method', 'offer', 'area'] as const).map(key => <tr key={key} className="border-t border-neutral-800 align-top"><th scope="row" className="p-3">{t(`marketplace.${key}`)}</th>{rows.map(row => <td className="p-3 whitespace-pre-wrap break-words" key={row.coach_id}>{row[key] || t('marketplace.notProvided')}</td>)}</tr>)}
            {(['disciplines', 'languages', 'formats'] as const).map(key => <tr key={key} className="border-t border-neutral-800 align-top"><th scope="row" className="p-3">{t(`marketplace.${key}`)}</th>{rows.map(row => <td className="p-3" key={row.coach_id}>{row[key].map(value => t(`marketplace.${value}`)).join(', ')}</td>)}</tr>)}
            <tr className="border-t border-neutral-800"><th scope="row" className="p-3">{t('marketplace.availability')}</th>{rows.map(row => <td className="p-3" key={row.coach_id}>{t(row.accepting_clients ? 'marketplace.available' : 'marketplace.unavailable')}</td>)}</tr>
            <tr className="border-t border-neutral-800"><th scope="row" className="p-3">{t('marketplace.viewCoach')}</th>{rows.map(row => <td className="p-3" key={row.coach_id}><Link className="inline-flex min-h-11 items-center text-blue-400 underline" to={`/coaches/${row.coach_id}?${params}`}>{row.public_name}</Link></td>)}</tr>
          </tbody>
        </table>
      </div>}
    </>}
  </div>;
}
