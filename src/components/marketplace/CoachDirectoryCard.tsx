import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { matchingReasons, type CoachPublicProfile, type marketFilters } from '../../lib/marketplace';

interface Props {
  profile: CoachPublicProfile;
  verified?: boolean;
  filters: ReturnType<typeof marketFilters>;
  query: string;
  compared: boolean;
  comparisonFull: boolean;
  onCompare: (checked: boolean) => void;
}

export default function CoachDirectoryCard({ profile, verified, filters, query, compared, comparisonFull, onCompare }: Props) {
  const { t } = useTranslation();
  const reasons = matchingReasons(profile, filters);
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 transition-colors hover:border-neutral-600">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-lg font-semibold text-blue-300">
          {profile.public_name.trim().slice(0, 1).toLocaleUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-white">{profile.public_name}</h2>
          {verified && <p className="text-xs text-blue-300">{t('marketplace.verifiedBadge')}</p>}
          <p className="text-sm text-neutral-400 truncate">
            {[...profile.disciplines, ...profile.formats].slice(0, 3).map(v => t(`marketplace.${v}`)).join(' · ')}
          </p>
        </div>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">{profile.introduction}</p>
      <p className="text-sm text-neutral-400">
        {[profile.area, profile.languages.map(v => t(`marketplace.${v}`)).join(' / ')].filter(Boolean).join(' · ')}
      </p>
      <div className="flex flex-wrap gap-2">
        {reasons.map(reason => <span key={reason} className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">{t(`marketplace.${reason}`)}</span>)}
      </div>
      {reasons.length > 0 && (
        <p className="text-sm text-blue-300">{t('marketplace.whyThisCoach')}</p>
      )}
      <p className="text-sm text-neutral-500">{t('marketplace.priceOnRequest')}</p>
      <div className="mt-auto space-y-2 border-t border-neutral-800 pt-3">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-blue-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" to={`/coaches/${profile.coach_id}?${query}`}>
          {t('marketplace.viewCoach')}<ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-300">
          <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={compared} disabled={!compared && comparisonFull} onChange={event => onCompare(event.target.checked)} />
          {t('marketplace.compareCoach', { name: profile.public_name })}
        </label>
      </div>
    </article>
  );
}
