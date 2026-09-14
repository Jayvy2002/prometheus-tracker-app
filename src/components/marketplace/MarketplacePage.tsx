import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { MARKETPLACE_CONSENT_VERSION, comparisonIds, coachingRequestKey, clearCoachingRequestKey, MARKET_DISCIPLINES, MARKET_FORMATS, MARKET_LANGUAGES, marketFilters, requestActions, type CoachPublicProfile, type CoachingRequest } from '../../lib/marketplace';
import CoachDirectoryCard from './CoachDirectoryCard';
import { marketRpc, readCoachProfile, readRequests } from '../../lib/marketplaceApi';
import { DIRECT_INVITE_CONSENT_SCOPES } from '../../lib/relationshipConsent';
import { track } from '../../lib/telemetryClient';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import Input from '../ui/Input';

const blank: CoachPublicProfile = { coach_id: '', public_name: '', introduction: '', method: '', offer: '', disciplines: [], languages: [], formats: [], area: '', published: false, accepting_clients: false, updated_at: '' };
const fieldStyle = 'w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-white';

export default function MarketplacePage({ mode }: { mode: 'directory' | 'profile' | 'detail' | 'requests' }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const owner = useAuthStore(s => s.user?.id) ?? '';
  const fetchMyRole = useCoachingStore(s => s.fetchMyRole);
  const fetchClients = useCoachingStore(s => s.fetchClients);
  const fetchMyCoach = useCoachingStore(s => s.fetchMyCoach);
  const activeCoachId = useCoachingStore(s => s.accountSnapshot?.activeCoachId) ?? null;
  const { coachId } = useParams();
  const [params, setParams] = useSearchParams();
  const filters = marketFilters(params);
  const comparisonKey = params.get('compare') ?? '';
  const [compared, setCompared] = useState(() => comparisonIds(params));
  useEffect(() => { setCompared(comparisonIds(new URLSearchParams({ compare: comparisonKey }))); }, [comparisonKey]);
  const filterKey = JSON.stringify(filters);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [profiles, setProfiles] = useState<CoachPublicProfile[]>([]);
  const [profile, setProfile] = useState<CoachPublicProfile | null>(null);
  const [requests, setRequests] = useState<CoachingRequest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [consent, setConsent] = useState(false);
  const [relationshipConsent, setRelationshipConsent] = useState(false);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const sequence = useRef(0);
  const writing = useRef(false);

  useEffect(() => {
    const seq = ++sequence.current;
    writing.current = false; setBusy(false); setStatus('loading'); setError(''); setNotice('');
    setProfiles([]); setProfile(null); setRequests([]); setConsent(false); setRelationshipConsent(false); setName(''); setSummary('');
    void (async () => {
      if (mode === 'directory') {
        const selected = JSON.parse(filterKey) as ReturnType<typeof marketFilters>;
        let query = supabase.from('coach_profiles').select('*').eq('published', true).eq('accepting_clients', true).neq('coach_id', owner);
        if (selected.discipline) query = query.contains('disciplines', [selected.discipline]);
        if (selected.language) query = query.contains('languages', [selected.language]);
        if (selected.format) query = query.contains('formats', [selected.format]);
        const { data, error } = await query.order('public_name').order('coach_id').range(page * 20, page * 20 + 20);
        if (error) throw error;
        if (seq !== sequence.current) return;
        setProfiles((data ?? []).slice(0, 20)); setMore((data?.length ?? 0) > 20);
      } else if (mode === 'profile' || mode === 'detail') {
        const found = await readCoachProfile(mode === 'profile' ? owner : coachId ?? '');
        if (seq !== sequence.current) return;
        setProfile(found ?? (mode === 'profile' ? { ...blank, coach_id: owner } : null));
      } else {
        const found = await readRequests(owner, page);
        if (seq !== sequence.current) return;
        setRequests(found.slice(0, 50)); setMore(found.length > 50);
        if (found.some(row => row.status === 'accepted' && row.client_id === owner)) {
          void fetchMyRole(owner);
          void fetchMyCoach();
        }
      }
      if (seq === sequence.current) setStatus('ready');
    })().catch(() => { if (seq === sequence.current) setStatus('failed'); });
    return () => { sequence.current = seq + 1; };
  }, [owner, mode, coachId, revision, filterKey, page, fetchMyRole, fetchMyCoach]);

  async function write(action: () => Promise<void>) {
    if (writing.current) return;
    const seq = sequence.current;
    writing.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause) {
      if (seq === sequence.current) {
        const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
        const key = ['profile_changed', 'coach_unavailable', 'already_coached', 'request_closed', 'session_changed', 'consent_renewal_required'].includes(message) ? message : 'saveError';
        setError(t(`marketplace.${key}`));
      }
    } finally { if (seq === sequence.current) { writing.current = false; setBusy(false); } }
  }
  const title = t(`marketplace.${mode}`);
  const pagination = <div className="flex gap-3">{page > 0 && <Button variant="secondary" onClick={() => setPage(n => n - 1)}>{t('marketplace.previous')}</Button>}{more && <Button variant="secondary" onClick={() => setPage(n => n + 1)}>{t('marketplace.next')}</Button>}</div>;
  const content = () => {
    if (status === 'loading') return <p role="status">{t('marketplace.loading')}</p>;
    if (status === 'failed') return <div className="space-y-3"><p role="alert">{t('marketplace.loadError')}</p><Button onClick={() => setRevision(n => n + 1)}>{t('errors.retry')}</Button></div>;
    if (mode === 'requests') return <><Button variant="secondary" onClick={() => setRevision(n => n + 1)}>{t('marketplace.refresh')}</Button>{requests.length ? <div className="space-y-4">{requests.map(row => <article key={row.id} className="rounded-xl border border-neutral-800 p-4 space-y-3">
      <p className="text-sm text-neutral-400">{t(row.client_id === owner ? 'marketplace.fromYou' : 'marketplace.toYou')}</p><h2 className="font-semibold">{row.client_id === owner ? row.coach_name || t('marketplace.coachUnavailableName') : row.public_name}</h2>
      <p className="whitespace-pre-wrap break-words">{row.summary}</p>
      <p className="text-sm text-neutral-300">{t(`marketplace.${row.status}`)}</p>
      <time className="block text-xs text-neutral-500" dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString(i18n.language)}</time>
      {row.status === 'accepted' && row.relationship_state === 'active' && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">{t(row.coach_id === owner ? 'marketplace.coachingActiveCoach' : 'marketplace.coachingActive')}</p>
          {row.coach_id === owner && <Button onClick={() => navigate(`/clients/${row.client_id}`)}>{t('marketplace.openClient')}</Button>}
          {row.client_id === owner && <Button onClick={() => navigate('/dashboard')}>{t('marketplace.goDashboard')}</Button>}
        </div>
      )}
      {row.status === 'accepted' && row.relationship_state !== 'active' && <p>{t(row.relationship_state === 'ended' ? 'marketplace.relationshipEnded' : 'marketplace.relationshipUnknown')}</p>}
      {row.client_id === owner && row.status !== 'accepted' && <Link className="block min-h-11 inline-flex items-center text-blue-400 underline" to={`/coaches/${row.coach_id}`}>{t('marketplace.viewCoach')}</Link>}
      <div className="flex flex-wrap gap-3">{requestActions(row, owner).map(action => <Button key={action} disabled={busy} variant={action === 'accepted' ? 'primary' : 'secondary'} onClick={() => {
        const seq = sequence.current;
        void write(async () => {
          const updated = await marketRpc<CoachingRequest>('respond_coaching_request', { p_request: row.id, p_status: action }, owner);
          if (seq === sequence.current) setRequests(rows => rows.map(r => r.id === updated.id ? { ...r, ...updated } : r));
          if (action === 'accepted') {
            track('coaching_request_accepted');
            await fetchClients();
            await fetchMyRole(owner);
          }
          if (seq === sequence.current) setRevision(n => n + 1);
        });
      }}>{t(`marketplace.action_${action}`)}</Button>)}</div>
    </article>)}</div> : <p>{t('marketplace.noRequests')}</p>}{pagination}</>;
    if (mode === 'directory') return <>
      {compared.length >= 2 && <Link className="inline-flex min-h-11 items-center text-blue-400 underline" to={`/coaches/compare?${params}`}>{t('marketplace.compare')}</Link>}
      <div className="grid gap-3 sm:grid-cols-3">{([['discipline', MARKET_DISCIPLINES], ['language', MARKET_LANGUAGES], ['format', MARKET_FORMATS]] as const).map(([key, values]) => <div key={key} className="space-y-2"><label htmlFor={`market-filter-${key}`}>{t(`marketplace.${key}`)}</label><select id={`market-filter-${key}`} className={fieldStyle} value={filters[key]} onChange={e => {
        const next = new URLSearchParams(params); if (e.target.value) next.set(key, e.target.value); else next.delete(key); setPage(0); setParams(next);
      }}><option value="">{t('marketplace.any')}</option>{values.map(value => <option key={value} value={value}>{t(`marketplace.${value}`)}</option>)}</select></div>)}</div>
      <p className="text-sm text-neutral-400">{t('marketplace.matchExplanation')}</p>
      {!profiles.length && <p>{t('marketplace.noResults')}</p>}
      <div className="grid gap-4 md:grid-cols-2">{profiles.map(row => <CoachDirectoryCard key={row.coach_id} profile={row} filters={filters} query={params.toString()} compared={compared.includes(row.coach_id)} comparisonFull={compared.length >= 3} onCompare={checked => {
          const selected = checked ? [...compared, row.coach_id] : compared.filter(id => id !== row.coach_id);
          setCompared(selected);
          const next = new URLSearchParams(params); if (selected.length) next.set('compare', selected.join(',')); else next.delete('compare'); setParams(next);
        }} />)}</div>
      {pagination}
    </>;
    if (!profile) return <p>{t('marketplace.unavailable')}</p>;
    if (mode === 'profile') return <form onSubmit={(e: FormEvent) => {
      e.preventDefault(); const seq = sequence.current;
      void write(async () => {
        const saved = await marketRpc<CoachPublicProfile>('save_my_coach_profile', { p_profile: profile, p_expected_updated_at: profile.updated_at || null }, owner);
        if (seq === sequence.current) { setProfile(saved); setNotice(t('marketplace.saved')); }
      });
    }}><fieldset disabled={busy} className="space-y-4">
      <p className="text-sm text-neutral-400">{t('marketplace.publicDisclosure')}</p>
      <Input required maxLength={100} label={t('marketplace.publicName')} value={profile.public_name} onChange={e => setProfile({ ...profile, public_name: e.target.value })} />
      {(['introduction', 'method', 'offer'] as const).map(key => <label key={key} className="block space-y-2">{t(`marketplace.${key}`)}<textarea className={fieldStyle} required={profile.published} maxLength={2000} rows={4} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></label>)}
      {([['disciplines', MARKET_DISCIPLINES], ['languages', MARKET_LANGUAGES], ['formats', MARKET_FORMATS]] as const).map(([key, values]) => <fieldset key={key}><legend>{t(`marketplace.${key}`)}</legend><div className="flex flex-wrap gap-4">{values.map(value => <label key={value} className="min-h-11 flex items-center gap-2"><input type="checkbox" checked={profile[key].includes(value)} onChange={e => setProfile({ ...profile, [key]: e.target.checked ? [...profile[key], value] : profile[key].filter(v => v !== value) })} />{t(`marketplace.${value}`)}</label>)}</div></fieldset>)}
      <Input maxLength={150} required={profile.published && profile.formats.some(v => v !== 'online')} label={t('marketplace.area')} value={profile.area} onChange={e => setProfile({ ...profile, area: e.target.value })} />
      {(['published', 'accepting_clients'] as const).map(key => <label key={key} className="min-h-11 flex items-center gap-2"><input type="checkbox" checked={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.checked })} />{t(`marketplace.${key}`)}</label>)}
      <Button type="submit" loading={busy}>{t('common.save')}</Button>
      {profile.published && <Link className="block text-blue-400 underline" to={`/coaches/${owner}`}>{t('marketplace.viewCoach')}</Link>}
    </fieldset></form>;
    return <div className="space-y-5">
      <header className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl font-semibold text-blue-300">
          {profile.public_name.trim().slice(0, 1).toLocaleUpperCase()}
        </div>
        <h2 className="text-2xl font-semibold text-white">{profile.public_name}</h2>
        <p className="text-sm text-neutral-400">{[...profile.disciplines, ...profile.formats].map(v => t(`marketplace.${v}`)).join(' · ')}</p>
        <p className="text-sm text-neutral-400">{[profile.area, profile.languages.map(v => t(`marketplace.${v}`)).join(' / ')].filter(Boolean).join(' · ')}</p>
        <p className="text-sm text-neutral-500">{t(profile.accepting_clients ? 'marketplace.available' : 'marketplace.unavailable')}</p>
        <p className="text-sm text-neutral-500">{t('marketplace.priceOnRequest')}</p>
      </header>
      {(['introduction', 'method', 'offer'] as const).map(key => <section key={key}><h3 className="font-semibold text-white">{t(`marketplace.${key}`)}</h3><p className="whitespace-pre-wrap break-words text-neutral-300">{profile[key]}</p></section>)}
      {!profile.accepting_clients && <p>{t('marketplace.unavailable')}</p>}
      {profile.accepting_clients && profile.coach_id !== owner && activeCoachId && <p>{t('marketplace.already_coached')}</p>}
      {profile.accepting_clients && profile.coach_id !== owner && !activeCoachId && <form className="space-y-4" onSubmit={e => {
        e.preventDefault(); if (!consent || !relationshipConsent) return; const seq = sequence.current;
        void write(async () => {
          const result = await marketRpc<CoachingRequest>('request_coaching', { p_coach: profile.coach_id, p_public_name: name, p_summary: summary, p_sharing_version: MARKETPLACE_CONSENT_VERSION, p_request_key: coachingRequestKey(sessionStorage, owner, profile.coach_id) }, owner);
          if (seq === sequence.current) { clearCoachingRequestKey(sessionStorage, owner, profile.coach_id); setNotice(t(result.status === 'pending' ? 'marketplace.sent' : `marketplace.${result.status}`)); setConsent(false); setRelationshipConsent(false); }
        });
      }}><fieldset disabled={busy} className="space-y-4">
        <Input required maxLength={100} label={t('marketplace.yourName')} value={name} onChange={e => setName(e.target.value)} />
        <label className="block space-y-2">{t('marketplace.summary')}<textarea required className={fieldStyle} maxLength={1500} rows={4} value={summary} onChange={e => setSummary(e.target.value)} /></label>
        <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{t('marketplace.sharing')}</span></label>
        <p className="text-sm text-neutral-300">{t('marketplace.relationshipIfAccepted')}</p>
        <ul className="text-sm text-neutral-400 list-disc pl-5 space-y-1">
          {DIRECT_INVITE_CONSENT_SCOPES.map(scope => (
            <li key={scope}>{t(`coaching.invite.scopes.${scope}`)}</li>
          ))}
        </ul>
        <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" required checked={relationshipConsent} onChange={e => setRelationshipConsent(e.target.checked)} /><span>{t('marketplace.consentAck')}</span></label>
        <Button type="submit" loading={busy} disabled={!consent || !relationshipConsent}>{t('marketplace.send')}</Button>
      </fieldset></form>}
    </div>;
  };
  return <div className="mx-auto w-full max-w-5xl p-4 md:p-6 pb-28 space-y-5">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <nav className="flex flex-wrap gap-2">
      <Link aria-current={mode === 'directory' || mode === 'detail' ? 'page' : undefined} className={`min-h-11 inline-flex items-center rounded-xl px-3 text-sm ${mode === 'directory' || mode === 'detail' ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'}`} to={`/coaches?${params}`}>{t('marketplace.directory')}</Link>
      <Link aria-current={mode === 'requests' ? 'page' : undefined} className={`min-h-11 inline-flex items-center rounded-xl px-3 text-sm ${mode === 'requests' ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'}`} to="/coaching-requests">{t('marketplace.requests')}</Link>
    </nav>
    {error && <div><p role="alert" className="text-rose-300">{error}</p>{mode === 'profile' && <Button variant="secondary" onClick={() => setRevision(n => n + 1)}>{t('marketplace.reloadProfile')}</Button>}</div>}
    {notice && <p role="status" className="text-emerald-300">{notice}</p>}
    {content()}
  </div>;
}
