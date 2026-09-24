import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ListChecks } from 'lucide-react';
import {
  MARKET_DISCIPLINES,
  MARKET_FORMATS,
  MARKET_LANGUAGES,
  marketFilters,
  type CoachPublicProfile,
  type CoachingRequest,
} from '../../lib/marketplace';
import Button from '../ui/Button';
import ChipGroup from './ChipGroup';
import CoachDirectoryCard from './CoachDirectoryCard';
import { requestStep } from './marketplaceCopy';

export default function DirectoryView({
  profiles,
  verifiedIds,
  compared,
  onCompared,
  page,
  more,
  onPage,
  openRequests,
}: {
  profiles: CoachPublicProfile[];
  verifiedIds: string[];
  compared: string[];
  onCompared: (ids: string[]) => void;
  page: number;
  more: boolean;
  onPage: (page: number) => void;
  /** The athlete's requests still waiting on someone. */
  openRequests: CoachingRequest[];
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = marketFilters(params);
  const options = (values: readonly string[]) => values.map(value => ({ value, label: t(`marketplace.${value}`) }));
  const setFilter = (key: 'discipline' | 'format' | 'language', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    onPage(0);
    setParams(next);
  };
  const toCompare = (ids: string[]) => {
    onCompared(ids);
    const next = new URLSearchParams(params);
    if (ids.length) next.set('compare', ids.join(',')); else next.delete('compare');
    setParams(next);
  };
  const waiting = openRequests.find(row => row.status === 'coach_accepted') ?? openRequests[0] ?? null;

  return (
    <div className="space-y-5">
      {waiting && (
        <Link
          to="/coaching-requests"
          className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-600/10 p-4 hover:border-blue-500/50"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-blue-300">{t(`marketplace.step_${requestStep(waiting.status) ?? 'sent'}`)}</p>
            <p className="text-sm font-medium text-white">
              {waiting.status === 'coach_accepted'
                ? t('marketplace.bannerConfirm', { name: waiting.coach_name || t('marketplace.coachUnavailableName') })
                : t('marketplace.bannerWaiting', { name: waiting.coach_name || t('marketplace.coachUnavailableName') })}
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-blue-300" aria-hidden="true" />
        </Link>
      )}

      <div className="space-y-3">
        <ChipGroup scroll allowEmpty hideLabel label={t('marketplace.discipline')} options={options(MARKET_DISCIPLINES)} value={filters.discipline} onChange={value => setFilter('discipline', value)} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
          <ChipGroup inline allowEmpty hideLabel label={t('marketplace.format')} options={options(MARKET_FORMATS)} value={filters.format} onChange={value => setFilter('format', value)} />
          <span className="w-px shrink-0 self-stretch bg-neutral-800" aria-hidden="true" />
          <ChipGroup inline allowEmpty hideLabel label={t('marketplace.language')} options={options(MARKET_LANGUAGES)} value={filters.language} onChange={value => setFilter('language', value)} />
        </div>
      </div>

      <Link
        to="/coaches/match"
        className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-600"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300" aria-hidden="true">
          <ListChecks size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{t('marketplace.guidedTitle')}</p>
          <p className="text-xs text-neutral-400">{t('marketplace.guidedBody')}</p>
        </div>
        <ArrowRight size={16} className="shrink-0 text-neutral-500" aria-hidden="true" />
      </Link>

      <p className="text-sm text-neutral-400" role="status">
        {profiles.length === 0 ? t('marketplace.noResults') : t('marketplace.resultsCount', { count: profiles.length, more: more ? '+' : '' })}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {profiles.map(row => (
          <CoachDirectoryCard
            key={row.coach_id}
            profile={row}
            verified={verifiedIds.includes(row.coach_id)}
            filters={filters}
            query={params.toString()}
            compared={compared.includes(row.coach_id)}
            comparisonFull={compared.length >= 3}
            onCompare={checked => toCompare(checked ? [...compared, row.coach_id] : compared.filter(id => id !== row.coach_id))}
          />
        ))}
      </div>

      {(page > 0 || more) && (
        <div className="flex gap-3">
          {page > 0 && <Button variant="secondary" onClick={() => onPage(page - 1)}>{t('marketplace.previous')}</Button>}
          {more && <Button variant="secondary" onClick={() => onPage(page + 1)}>{t('marketplace.next')}</Button>}
        </div>
      )}

      {compared.length >= 2 && (
        <div className="fixed inset-x-0 z-30 px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:left-64">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-neutral-700 bg-neutral-900/95 p-2 pl-4 shadow-xl backdrop-blur">
            <span className="text-sm text-neutral-300">{t('marketplace.compareSelected', { count: compared.length })}</span>
            <Link to={`/coaches/compare?${params}`} className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
              {t('marketplace.compare')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
