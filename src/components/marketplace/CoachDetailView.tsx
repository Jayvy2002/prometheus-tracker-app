import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, CalendarClock, Globe, MapPin, MessageSquare, Wallet } from 'lucide-react';
import {
  coachHasVerifiedBadge,
  type CoachPublicProfile,
  type CoachQualification,
  type CoachingRequest,
  type MarketplaceReport,
  type ProspectSnapshot,
} from '../../lib/marketplace';
import { DIRECT_INVITE_CONSENT_SCOPES } from '../../lib/relationshipConsent';
import Button from '../ui/Button';
import Input from '../ui/Input';
import QualificationList from './QualificationList';
import MarketplaceReportForm from './MarketplaceReportForm';
import { coachFormatLine, listedRateLabel } from './marketplaceCopy';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white placeholder:text-neutral-500';
// Optional details a prospect may add; summary is the message itself.
const DETAIL_KEYS = ['objective', 'level', 'availability', 'constraints', 'budget', 'expectations', 'discipline', 'language'] as const;

export interface RequestDraft {
  name: string;
  summary: string;
  snapshot: ProspectSnapshot;
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 text-neutral-500" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-neutral-500">{label}</dt>
        <dd className="break-words text-sm text-neutral-200">{children}</dd>
      </div>
    </div>
  );
}

export default function CoachDetailView({
  profile,
  qualifications,
  owner,
  activeCoachId,
  openRequest,
  busy,
  defaultName,
  backTo,
  onSend,
  onReported,
}: {
  profile: CoachPublicProfile;
  qualifications: CoachQualification[];
  owner: string;
  activeCoachId: string | null;
  /** An open request this athlete already sent to this coach. */
  openRequest: CoachingRequest | null;
  busy: boolean;
  defaultName: string;
  backTo: string;
  /** Resolves true once the server confirmed the request. */
  onSend: (draft: RequestDraft) => Promise<boolean>;
  onReported: (report: MarketplaceReport) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [summary, setSummary] = useState('');
  const [snapshot, setSnapshot] = useState<ProspectSnapshot>({});
  const [consent, setConsent] = useState(false);
  const [relationshipConsent, setRelationshipConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const own = profile.coach_id === owner;
  const firstName = profile.public_name.trim().split(/\s+/)[0] || profile.public_name;
  const where = [profile.area_city || profile.area, profile.area_region, profile.area_country].filter(Boolean).join(', ');
  const style = [profile.contact_frequency, profile.coaching_style].filter(Boolean).map(v => t(`marketplace.${v}`)).join(' · ');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!consent || !relationshipConsent || busy) return;
    void onSend({ name, summary, snapshot }).then(ok => {
      if (!ok) return;
      setSent(true);
      setOpen(false);
      setConsent(false);
      setRelationshipConsent(false);
    });
  };

  let cta: ReactNode = null;
  if (own) {
    cta = (
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
        {t('marketplace.ownProfileNote')}
        <Link to="/coach/profile" className="text-blue-300 hover:text-white">{t('marketplace.editOffer')}</Link>
      </div>
    );
  } else if (!profile.accepting_clients) {
    cta = <p className="text-sm text-neutral-400">{t('marketplace.unavailable')}</p>;
  } else if (activeCoachId) {
    cta = <p className="text-sm text-neutral-400">{t('marketplace.already_coached')}</p>;
  } else if (sent || openRequest) {
    cta = (
      <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3" role="status">
        <p className="text-sm font-medium text-white">
          {sent ? t('marketplace.requestSentTitle', { name: firstName }) : t('marketplace.existingRequest')}
        </p>
        <p className="text-sm text-neutral-300">{t('marketplace.requestSentBody')}</p>
        <Link to="/coaching-requests" className="inline-flex min-h-11 items-center text-sm text-blue-300 hover:text-white">
          {t('marketplace.seeMyRequests')}
        </Link>
      </div>
    );
  } else if (!open) {
    cta = (
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <MessageSquare size={16} aria-hidden="true" />{t('marketplace.writeTo', { name: firstName })}
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      <Link to={backTo} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" />{t('marketplace.backToCoaches')}
      </Link>

      <header className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl font-semibold text-blue-300" aria-hidden="true">
            {profile.public_name.trim().slice(0, 1).toLocaleUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-white">{profile.public_name}</h2>
            <p className="text-sm text-neutral-400">{profile.disciplines.map(v => t(`marketplace.${v}`)).join(' · ')}</p>
            {coachHasVerifiedBadge(qualifications) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-300">
                <BadgeCheck size={13} aria-hidden="true" />{t('marketplace.verifiedBadge')}
              </p>
            )}
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact icon={<Globe size={15} />} label={t('marketplace.fact_format')}>{coachFormatLine(t, profile)}</Fact>
          {where && <Fact icon={<MapPin size={15} />} label={t('marketplace.fact_area')}>{where}</Fact>}
          <Fact icon={<Wallet size={15} />} label={t('marketplace.fact_price')}>{listedRateLabel(t, profile)}</Fact>
          {style && <Fact icon={<CalendarClock size={15} />} label={t('marketplace.fact_style')}>{style}</Fact>}
        </dl>
        {cta}
      </header>

      {open && !own && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-blue-500/30 bg-blue-600/5 p-5">
          <fieldset disabled={busy} className="space-y-4">
            <legend className="text-base font-semibold text-white">{t('marketplace.writeTo', { name: firstName })}</legend>
            <Input required maxLength={100} label={t('marketplace.yourName')} value={name} onChange={e => setName(e.target.value)} />
            <label className="block space-y-2 text-sm text-neutral-300">
              {t('marketplace.summary')}
              <textarea
                required
                className={fieldStyle}
                maxLength={1500}
                rows={4}
                placeholder={t('marketplace.messagePlaceholder')}
                value={summary}
                onChange={e => setSummary(e.target.value)}
              />
            </label>
            <details className="rounded-xl border border-neutral-800 p-3">
              <summary className="min-h-11 cursor-pointer text-sm text-neutral-300 flex items-center">{t('marketplace.moreDetails')}</summary>
              <div className="mt-2 space-y-3">
                {DETAIL_KEYS.map(key => (
                  <label key={key} className="block space-y-1 text-sm text-neutral-300">
                    {t(`marketplace.snapshot_${key}`)}
                    <input
                      className={fieldStyle}
                      maxLength={key === 'expectations' || key === 'constraints' ? 500 : 200}
                      value={snapshot[key] ?? ''}
                      onChange={e => setSnapshot(current => ({ ...current, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </details>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-neutral-400">
              <input className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>{t('marketplace.sharing')}</span>
            </label>
            <div className="space-y-2">
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer text-neutral-300 flex items-center">{t('marketplace.scopesDetails')}</summary>
                <p className="mb-2 text-xs leading-relaxed text-neutral-400">{t('marketplace.relationshipIfAccepted')}</p>
                <ul className="list-disc space-y-1 pl-5 text-neutral-400">
                  {DIRECT_INVITE_CONSENT_SCOPES.map(scope => (
                    <li key={scope}>{t(`coaching.invite.scopes.${scope}`)}</li>
                  ))}
                </ul>
              </details>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-neutral-400">
                <input className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" type="checkbox" required checked={relationshipConsent} onChange={e => setRelationshipConsent(e.target.checked)} />
                <span>{t('marketplace.consentAck')}</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} disabled={!consent || !relationshipConsent || !summary.trim() || !name.trim()}>
                {t('marketplace.send')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </fieldset>
        </form>
      )}

      {(['introduction', 'method', 'offer'] as const).filter(key => profile[key]?.trim()).map(key => (
        <section key={key} className="space-y-1">
          <h3 className="font-semibold text-white">{t(`marketplace.${key}`)}</h3>
          <p className="whitespace-pre-wrap break-words text-neutral-300">{profile[key]}</p>
        </section>
      ))}

      <QualificationList rows={qualifications} />

      {!own && (
        <MarketplaceReportForm owner={owner} targetUserId={profile.coach_id} subjectType="profile" onSubmitted={onReported} />
      )}
    </div>
  );
}
