import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Check, MapPin, Plus } from 'lucide-react';
import { matchingReasons, type CoachPublicProfile, type marketFilters } from '../../lib/marketplace';
import { coachFormatLine, listedRateLabel } from './marketplaceCopy';

interface Props {
  profile: CoachPublicProfile;
  verified?: boolean;
  filters: ReturnType<typeof marketFilters>;
  query: string;
  compared: boolean;
  comparisonFull: boolean;
  onCompare: (checked: boolean) => void;
}

/** The whole card opens the profile; « Comparer » is the only other action. */
export default function CoachDirectoryCard({ profile, verified, filters, query, compared, comparisonFull, onCompare }: Props) {
  const { t } = useTranslation();
  const reasons = matchingReasons(profile, filters);
  const where = [profile.area_city || profile.area, profile.area_country].filter(Boolean).join(', ');
  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-[#525252]">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-lg font-semibold text-blue-300">
          {profile.public_name.trim().slice(0, 1).toLocaleUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-semibold text-white">
            <Link to={`/coaches/${profile.coach_id}${query ? `?${query}` : ''}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
              {profile.public_name}
            </Link>
          </h2>
          {verified && (
            <p className="flex items-center gap-1 text-xs text-blue-300">
              <BadgeCheck size={13} aria-hidden="true" /> {t('marketplace.verifiedBadge')}
            </p>
          )}
          <p className="truncate text-sm text-neutral-400">
            {profile.disciplines.slice(0, 2).map(v => t(`marketplace.${v}`)).join(' · ')}
          </p>
        </div>
      </div>

      {profile.introduction && (
        <p className="line-clamp-2 break-words text-sm leading-relaxed text-neutral-300">{profile.introduction}</p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
        <span>{coachFormatLine(t, profile)}</span>
        {where && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{where}</span>}
      </div>

      {reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('marketplace.whyThisCoach')}>
          {reasons.map(reason => (
            <li key={reason} className="inline-flex items-center gap-1 rounded-full bg-blue-600/15 px-2.5 py-1 text-xs text-blue-200">
              <Check size={12} aria-hidden="true" />{t(`marketplace.${reason}`)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-800 pt-3">
        <p className="min-w-0 truncate text-sm text-neutral-300">{listedRateLabel(t, profile)}</p>
        <button
          type="button"
          aria-pressed={compared}
          aria-label={t('marketplace.compareCoach', { name: profile.public_name })}
          disabled={!compared && comparisonFull}
          onClick={() => onCompare(!compared)}
          className={`relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-xs transition-colors disabled:opacity-40 ${
            compared ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-neutral-700 text-neutral-300 hover:border-[#737373]'
          }`}
        >
          {compared ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          {t('marketplace.compareToggle')}
        </button>
      </div>
    </article>
  );
}
