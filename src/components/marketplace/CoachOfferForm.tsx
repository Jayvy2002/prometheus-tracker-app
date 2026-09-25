import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
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
  type CoachPublicProfile,
} from '../../lib/marketplace';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ChipGroup from './ChipGroup';
import FixedActionBar from '../coaching/FixedActionBar';
import { formatPriceInput, parsePriceInput } from './priceInput';

const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 md:p-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {hint && <p className="text-sm text-neutral-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, label, hint, onChange }: { checked: boolean; label: string; hint: string; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-neutral-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-neutral-700'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

/** « Mon offre »: what athletes see in the directory. Publishing stays opt-in. */
export default function CoachOfferForm({
  profile,
  owner,
  busy,
  onChange,
  onSave,
}: {
  profile: CoachPublicProfile;
  owner: string;
  busy: boolean;
  onChange: (next: CoachPublicProfile) => void;
  onSave: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const patch = (next: Partial<CoachPublicProfile>) => onChange({ ...profile, ...next });
  // The field keeps what is typed (« 120, » while typing); the profile keeps exact cents.
  const storedCents = profile.indicative_price_cents ?? null;
  const [priceText, setPriceText] = useState(() => formatPriceInput(storedCents, i18n.language));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const typedPrice = useRef(priceText);
  useEffect(() => {
    // A new stored value (load, save, reload) replaces the field, unless it is what was typed.
    const parsed = parsePriceInput(typedPrice.current);
    if (parsed.ok && parsed.cents === storedCents) return;
    const next = formatPriceInput(storedCents, i18n.language);
    typedPrice.current = next;
    setPriceText(next);
    setPriceInvalid(false);
  }, [storedCents, i18n.language]);
  const options = (values: readonly string[]) => values.map(value => ({ value, label: t(`marketplace.${value}`) }));
  const inPerson = profile.formats.some(v => v !== 'online');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (priceInvalid) return;
    onSave();
  };

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <Section title={t('marketplace.offerVisibility')} hint={t('marketplace.publicDisclosure')}>
          <Toggle
            checked={profile.published}
            label={t('marketplace.published')}
            hint={t(profile.published ? 'marketplace.visibleNow' : 'marketplace.hiddenNow')}
            onChange={value => patch({ published: value })}
          />
          <Toggle
            checked={profile.accepting_clients}
            label={t('marketplace.accepting_clients')}
            hint={t(profile.accepting_clients ? 'marketplace.available' : 'marketplace.unavailable')}
            onChange={value => patch({ accepting_clients: value })}
          />
          {profile.published && profile.updated_at && (
            <Link className="inline-flex min-h-11 items-center gap-1.5 text-sm text-blue-300 hover:text-white" to={`/coaches/${owner}`}>
              <Eye size={15} aria-hidden="true" />{t('marketplace.previewProfile')}
            </Link>
          )}
        </Section>

        <Section title={t('marketplace.sectionPresentation')}>
          <Input required maxLength={100} label={t('marketplace.publicName')} value={profile.public_name} onChange={e => patch({ public_name: e.target.value })} />
          {(['introduction', 'method', 'offer'] as const).map(key => (
            <label key={key} className="block space-y-2 text-sm text-neutral-300">
              {t(`marketplace.${key}`)}
              <textarea className={fieldStyle} required={profile.published} maxLength={2000} rows={3} value={profile[key]} onChange={e => patch({ [key]: e.target.value })} />
            </label>
          ))}
        </Section>

        <Section title={t('marketplace.sectionOffer')}>
          <ChipGroup multiple label={t('marketplace.disciplines')} options={options(MARKET_DISCIPLINES)} value={profile.disciplines} onChange={value => patch({ disciplines: value })} />
          <ChipGroup multiple label={t('marketplace.formats')} options={options(MARKET_FORMATS)} value={profile.formats} onChange={value => patch({ formats: value })} />
          <ChipGroup multiple label={t('marketplace.languages')} options={options(MARKET_LANGUAGES)} value={profile.languages} onChange={value => patch({ languages: value })} />
          <ChipGroup multiple label={t('marketplace.experience_levels')} options={options(MATCH_EXPERIENCE)} value={profile.experience_levels ?? []} onChange={value => patch({ experience_levels: value })} />
        </Section>

        <Section title={t('marketplace.sectionWhere')} hint={inPerson ? undefined : t('marketplace.whereOnlineHint')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input maxLength={80} required={profile.published && inPerson} label={t('marketplace.area_city')} value={profile.area_city ?? ''} onChange={e => patch({ area_city: e.target.value })} />
            <Input maxLength={80} label={t('marketplace.area_region')} value={profile.area_region ?? ''} onChange={e => patch({ area_region: e.target.value })} />
            <Input maxLength={80} required={profile.published && inPerson} label={t('marketplace.area_country')} value={profile.area_country ?? ''} onChange={e => patch({ area_country: e.target.value })} />
          </div>
        </Section>

        <Section title={t('marketplace.sectionStyle')}>
          <ChipGroup allowEmpty label={t('marketplace.contact_frequency')} options={options(MATCH_FREQUENCIES)} value={profile.contact_frequency ?? ''} onChange={value => patch({ contact_frequency: value })} />
          <ChipGroup allowEmpty label={t('marketplace.coaching_style')} options={options(MATCH_STYLES)} value={profile.coaching_style ?? ''} onChange={value => patch({ coaching_style: value })} />
          <ChipGroup allowEmpty label={t('marketplace.autonomy')} options={options(MATCH_AUTONOMY)} value={profile.autonomy ?? ''} onChange={value => patch({ autonomy: value })} />
        </Section>

        <Section title={t('marketplace.sectionPrice')} hint={t('marketplace.listedRate')}>
          <Input
            inputMode="decimal"
            label={t('marketplace.priceAmount')}
            value={priceText}
            aria-invalid={priceInvalid || undefined}
            error={priceInvalid ? t('marketplace.priceInvalid') : undefined}
            onChange={e => {
              const raw = e.target.value;
              typedPrice.current = raw;
              setPriceText(raw);
              const parsed = parsePriceInput(raw);
              setPriceInvalid(!parsed.ok);
              if (parsed.ok) patch({ indicative_price_cents: parsed.cents });
            }}
          />
          <ChipGroup label={t('marketplace.indicative_price_period')} options={options(MATCH_PRICE_PERIODS)} value={profile.indicative_price_period || 'on_request'} onChange={value => patch({ indicative_price_period: value })} />
          <ChipGroup allowEmpty label={t('marketplace.indicative_price_currency')} options={MARKET_BETA_CURRENCIES.map(value => ({ value, label: value }))} value={profile.indicative_price_currency ?? ''} onChange={value => patch({ indicative_price_currency: value })} />
        </Section>
      </fieldset>

      <FixedActionBar testId="coach-profile-save">
        <Button type="submit" form={formId} loading={busy} disabled={priceInvalid}>{t('common.save')}</Button>
      </FixedActionBar>
    </form>
  );
}
