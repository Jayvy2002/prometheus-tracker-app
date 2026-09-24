import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { supabase } from '../../lib/supabase';
import { MARKETPLACE_CONSENT_VERSION, comparisonIds, coachingRequestKey, clearCoachingRequestKey, coachHasVerifiedBadge, marketFilters, normalizeJoinRequestStatus, normalizeProspectSnapshot, requestActivatesFollow, type CoachPublicProfile, type CoachQualification, type CoachingRequest, type MarketplaceReport } from '../../lib/marketplace';
import CoachQualificationsPanel from './CoachQualificationsPanel';
import MarketplaceReportsList from './MarketplaceReportsList';
import CoachOfferForm from './CoachOfferForm';
import CoachDetailView, { type RequestDraft } from './CoachDetailView';
import DirectoryView from './DirectoryView';
import RequestCard from './RequestCard';
import { isOpenRequest } from './marketplaceCopy';
import { marketRpc, readCoachProfile, readCoachQualifications, readMyMarketplaceReports, readPublicCoachQualificationCards, readRequests } from '../../lib/marketplaceApi';
import { track } from '../../lib/telemetryClient';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';

const blank: CoachPublicProfile = {
  coach_id: '', public_name: '', introduction: '', method: '', offer: '', disciplines: [], languages: [], formats: [], area: '',
  area_city: '', area_region: '', area_country: '',
  published: false, accepting_clients: false, updated_at: '',
  contact_frequency: '', coaching_style: '', autonomy: '', experience_levels: [],
  indicative_price_cents: null, indicative_price_period: 'on_request', indicative_price_currency: '',
};

const SERVER_ERRORS = ['profile_changed', 'coach_unavailable', 'coach_account_closed', 'already_coached', 'request_closed', 'session_changed', 'consent_renewal_required', 'invalid_snapshot', 'invalid_proof_path', 'proof_missing'];

/**
 * Marketplace screens. The athlete finds a coach (directory, guided search),
 * writes to one, then confirms; the coach answers requests and edits the
 * public offer. Writes and their contract (consent, confirmation, telemetry)
 * live here; the views only render.
 */
export default function MarketplacePage({ mode }: { mode: 'directory' | 'profile' | 'detail' | 'requests' }) {
  const { t } = useTranslation();
  const owner = useAuthStore(s => s.user?.id) ?? '';
  const fullName = useProfileStore(s => s.profile?.full_name) ?? '';
  const fetchMyRole = useCoachingStore(s => s.fetchMyRole);
  const fetchClients = useCoachingStore(s => s.fetchClients);
  const fetchMyCoach = useCoachingStore(s => s.fetchMyCoach);
  const activeCoachId = useCoachingStore(s => s.accountSnapshot?.activeCoachId) ?? null;
  const { coachId } = useParams();
  const [params] = useSearchParams();
  const filters = marketFilters(params);
  const comparisonKey = params.get('compare') ?? '';
  const [compared, setCompared] = useState(() => comparisonIds(params));
  useEffect(() => { setCompared(comparisonIds(new URLSearchParams({ compare: comparisonKey }))); }, [comparisonKey]);
  const filterKey = JSON.stringify(filters);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [profiles, setProfiles] = useState<CoachPublicProfile[]>([]);
  const [profile, setProfile] = useState<CoachPublicProfile | null>(null);
  const [qualifications, setQualifications] = useState<CoachQualification[]>([]);
  const [verifiedIds, setVerifiedIds] = useState<string[]>([]);
  const [requests, setRequests] = useState<CoachingRequest[]>([]);
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const sequence = useRef(0);
  const writing = useRef(false);

  useEffect(() => {
    const seq = ++sequence.current;
    writing.current = false; setBusy(false); setStatus('loading'); setError(''); setNotice('');
    setProfiles([]); setProfile(null); setRequests([]); setReports([]); setQualifications([]); setVerifiedIds([]);
    void (async () => {
      if (mode === 'directory') {
        const selected = JSON.parse(filterKey) as ReturnType<typeof marketFilters>;
        let query = supabase.from('coach_profiles').select('*').eq('published', true).eq('accepting_clients', true).eq('directory_suspended', false).neq('coach_id', owner);
        if (selected.discipline) query = query.contains('disciplines', [selected.discipline]);
        if (selected.language) query = query.contains('languages', [selected.language]);
        if (selected.format) query = query.contains('formats', [selected.format]);
        const [{ data, error }, mine] = await Promise.all([
          query.order('public_name').order('coach_id').range(page * 20, page * 20 + 20),
          readRequests(owner, 0).catch(() => [] as CoachingRequest[]),
        ]);
        if (error) throw error;
        if (seq !== sequence.current) return;
        setProfiles((data ?? []).slice(0, 20)); setMore((data?.length ?? 0) > 20);
        setRequests(mine);
        const ids = (data ?? []).slice(0, 20).map(row => row.coach_id);
        if (ids.length) {
          const cards = await readPublicCoachQualificationCards(ids);
          if (seq !== sequence.current) return;
          const grouped = new Map<string, CoachQualification[]>();
          for (const row of cards) {
            const list = grouped.get(row.coach_id) ?? [];
            list.push(row);
            grouped.set(row.coach_id, list);
          }
          setVerifiedIds([...grouped.entries()].filter(([, list]) => coachHasVerifiedBadge(list)).map(([id]) => id));
        } else setVerifiedIds([]);
      } else if (mode === 'profile' || mode === 'detail') {
        const coach = mode === 'profile' ? owner : coachId ?? '';
        const [found, mine] = await Promise.all([
          readCoachProfile(coach),
          mode === 'detail' ? readRequests(owner, 0).catch(() => [] as CoachingRequest[]) : Promise.resolve([] as CoachingRequest[]),
        ]);
        if (seq !== sequence.current) return;
        setProfile(found ?? (mode === 'profile' ? { ...blank, coach_id: owner } : null));
        setRequests(mine);
        setQualifications(coach ? await readCoachQualifications(coach, owner) : []);
      } else {
        const found = await readRequests(owner, page);
        if (seq !== sequence.current) return;
        setRequests(found.slice(0, 50)); setMore(found.length > 50);
        const mine = await readMyMarketplaceReports(owner);
        if (seq !== sequence.current) return;
        setReports(mine);
        if (found.some(row => requestActivatesFollow(row.status) && row.client_id === owner)) {
          void fetchMyRole(owner);
          void fetchMyCoach();
        }
      }
      if (seq === sequence.current) setStatus('ready');
    })().catch(() => { if (seq === sequence.current) setStatus('failed'); });
    return () => { sequence.current = seq + 1; };
  }, [owner, mode, coachId, revision, filterKey, page, fetchMyRole, fetchMyCoach]);

  async function write(action: () => Promise<void>): Promise<boolean> {
    if (writing.current) return false;
    const seq = sequence.current;
    writing.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); return true; }
    catch (cause) {
      if (seq === sequence.current) {
        const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
        setError(t(`marketplace.${SERVER_ERRORS.includes(message) ? message : 'saveError'}`));
      }
      return false;
    } finally { if (seq === sequence.current) { writing.current = false; setBusy(false); } }
  }

  const respond = (row: CoachingRequest, action: 'accepted' | 'declined' | 'withdrawn' | 'confirmed') => {
    const seq = sequence.current;
    void write(async () => {
      const updated = await marketRpc<CoachingRequest>('respond_coaching_request', { p_request: row.id, p_status: action }, owner);
      const normalized = { ...updated, status: normalizeJoinRequestStatus(updated.status) };
      if (seq === sequence.current) setRequests(rows => rows.map(r => r.id === normalized.id ? { ...r, ...normalized } : r));
      if (action === 'accepted') {
        track('coaching_request_accepted');
      }
      if (action === 'confirmed') {
        track('marketplace_athlete_confirmed');
        await fetchClients();
        await fetchMyRole(owner);
        await fetchMyCoach();
      }
      if (seq === sequence.current) setRevision(n => n + 1);
    });
  };

  const sendRequest = (target: CoachPublicProfile, draft: RequestDraft) => {
    const seq = sequence.current;
    return write(async () => {
      const result = await marketRpc<CoachingRequest>('request_coaching', {
        p_coach: target.coach_id,
        p_public_name: draft.name,
        p_summary: draft.summary,
        p_sharing_version: MARKETPLACE_CONSENT_VERSION,
        p_request_key: coachingRequestKey(sessionStorage, owner, target.coach_id),
        p_snapshot: normalizeProspectSnapshot({ ...draft.snapshot, summary: draft.summary }),
      }, owner);
      const next = { ...result, status: normalizeJoinRequestStatus(result.status) };
      if (seq === sequence.current) {
        clearCoachingRequestKey(sessionStorage, owner, target.coach_id);
        setRequests(rows => [next, ...rows.filter(row => row.id !== next.id)]);
        if (next.status !== 'pending') setNotice(t(`marketplace.${next.status}`));
      }
    });
  };

  const addReport = (report: MarketplaceReport) => setReports(current => [report, ...current.filter(item => item.id !== report.id)]);
  const mine = requests.filter(row => row.client_id === owner);
  const received = requests.filter(row => row.coach_id === owner);
  const openMine = mine.filter(row => isOpenRequest(row.status));

  // An athlete's requests are a tab of « Trouver un coach »; a coach's are « Demandes reçues ».
  const title = mode === 'requests'
    ? t(mine.length ? 'marketplace.directory' : 'marketplace.receivedTitle')
    : t(`marketplace.${mode}`);
  const subtitle = mode === 'directory' ? t('marketplace.directorySubtitle') : mode === 'profile' ? t('marketplace.profileSubtitle') : null;
  // Athlete sections: the coaches, and their own requests. A coach reaches received requests from the side nav.
  const athleteTabs = mode === 'directory' || (mode === 'requests' && mine.length > 0);

  const content = () => {
    if (status === 'loading') return <p role="status" className="text-sm text-neutral-400">{t('marketplace.loading')}</p>;
    if (status === 'failed') return <div className="space-y-3"><p role="alert">{t('marketplace.loadError')}</p><Button onClick={() => setRevision(n => n + 1)}>{t('errors.retry')}</Button></div>;
    if (mode === 'requests') {
      if (!requests.length) {
        return (
          <div className="space-y-3 rounded-2xl border border-neutral-800 p-5 text-center">
            <p className="text-sm text-neutral-300">{t('marketplace.noRequests')}</p>
            <Link to="/coaches" className="inline-flex min-h-11 items-center text-sm text-blue-300 hover:text-white">{t('marketplace.directory')}</Link>
          </div>
        );
      }
      const list = (rows: CoachingRequest[]) => (
        <div className="space-y-3">
          {rows.map(row => <RequestCard key={row.id} row={row} owner={owner} busy={busy} onAction={respond} onReported={addReport} />)}
        </div>
      );
      return (
        <div className="space-y-6">
          {received.length > 0 && (
            <section className="space-y-3">
              {mine.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t('marketplace.receivedTitle')}</h2>}
              {list(received)}
            </section>
          )}
          {mine.length > 0 && (
            <section className="space-y-3">
              {received.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{t('marketplace.sentTitle')}</h2>}
              {list(mine)}
            </section>
          )}
          {more && <Button variant="secondary" onClick={() => setPage(n => n + 1)}>{t('marketplace.next')}</Button>}
          {reports.length > 0 && <MarketplaceReportsList rows={reports} />}
        </div>
      );
    }
    if (mode === 'directory') {
      return (
        <DirectoryView
          profiles={profiles}
          verifiedIds={verifiedIds}
          compared={compared}
          onCompared={setCompared}
          page={page}
          more={more}
          onPage={setPage}
          openRequests={openMine}
        />
      );
    }
    if (!profile) return <p>{t('marketplace.unavailable')}</p>;
    if (mode === 'profile') {
      return (
        <div className="space-y-6">
          <CoachOfferForm
            profile={profile}
            owner={owner}
            busy={busy}
            onChange={setProfile}
            onSave={() => {
              const seq = sequence.current;
              void write(async () => {
                const saved = await marketRpc<CoachPublicProfile>('save_my_coach_profile', { p_profile: profile, p_expected_updated_at: profile.updated_at || null }, owner);
                if (seq === sequence.current) { setProfile(saved); setNotice(t('marketplace.saved')); }
              });
            }}
          />
          <CoachQualificationsPanel owner={owner} rows={qualifications} busy={busy} onChange={setQualifications} onError={setError} />
        </div>
      );
    }
    return (
      <CoachDetailView
        key={profile.coach_id}
        profile={profile}
        qualifications={qualifications}
        owner={owner}
        activeCoachId={activeCoachId}
        openRequest={mine.find(row => row.coach_id === profile.coach_id && isOpenRequest(row.status)) ?? null}
        busy={busy}
        defaultName={fullName.trim().split(/\s+/)[0] ?? ''}
        backTo={`/coaches${params.toString() ? `?${params}` : ''}`}
        onSend={draft => sendRequest(profile, draft)}
        onReported={addReport}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 pb-28 md:p-6">
      {mode !== 'detail' && (
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
            </div>
            {mode === 'requests' && (
              <IconButton label={t('marketplace.refresh')} onClick={() => setRevision(n => n + 1)}>
                <RefreshCw size={16} />
              </IconButton>
            )}
          </div>
          {athleteTabs && (
            <nav className="inline-flex rounded-xl bg-neutral-900 p-1" aria-label={t('marketplace.directory')}>
              <Link
                aria-current={mode === 'directory' ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm ${mode === 'directory' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
                to={`/coaches${mode === 'directory' && params.toString() ? `?${params}` : ''}`}
              >
                {t('marketplace.tabCoaches')}
              </Link>
              <Link
                aria-current={mode === 'requests' ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm ${mode === 'requests' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
                to="/coaching-requests"
              >
                {t('marketplace.tabMyRequests')}
                {mode === 'directory' && openMine.length > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white">{openMine.length}</span>
                )}
              </Link>
            </nav>
          )}
        </header>
      )}
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-rose-300">{error}</p>{mode === 'profile' && <Button variant="secondary" onClick={() => setRevision(n => n + 1)}>{t('marketplace.reloadProfile')}</Button>}</div>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
      {content()}
    </div>
  );
}
