import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Link2, Users, ChevronRight, Plus, Upload } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { shouldOpenSetup } from '../../lib/coachAlerts';
import { parseRosterFilter, rosterHitsForFilter, ROSTER_FILTERS } from '../../lib/coachAsk';
import { todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import { rosterBackPath, rosterChainState, sortRosterClients } from '../../lib/coachRoster';
import { useClientGoalKinds } from '../../features/coaching/hooks/useClientGoalKinds';
import { goalKindLabelKey } from '../../features/coaching/domain/clientGoal';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

export default function ClientsPage() {
  const canCoach = useAccountContext().capabilities.coach;
  const { canReadClientDossier } = useResourcePermissions();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
     clients, invites, loading, opsLoading, opsRows, priorities, rosterSignals,
    fetchMyRole, fetchClients, fetchInvites, fetchCoachOps, fetchCoachMessages, createInvite, revokeInvite,
  } = useCoachingStore();
  const [searchParams] = useSearchParams();
  const rosterFilter = parseRosterFilter(searchParams.get('filter'));
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Ending a relationship is not a one-tap roster action: it lives in the client
  // file (« Retirer de mes clients ») with its explicit confirmation.
  const [clientQuery, setClientQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  // Same goal as the client file: the current goal, else the legacy profile goal.
  const { kinds: goalKinds } = useClientGoalKinds(clients);

  useEffect(() => {
    if (!user) return;
    fetchMyRole(user.id).then(() => {
      fetchClients();
      fetchInvites();
      fetchCoachOps();
      fetchCoachMessages();
    });
    if (searchParams.get('search') === '1') searchRef.current?.focus();
  }, [user, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setCreating(true);
    const result = await createInvite({ days: 7, maxUses });
    setCreating(false);
    if ('error' in result) {
      toast(result.error, 'error');
      return;
    }
    const url = `${window.location.origin}/invite/${result.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(result.token);
      toast(t('coaching.invite.copied'));
    } catch {
      toast(url, 'info');
    }
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      toast(t('coaching.invite.copied'));
    } catch {
      toast(url, 'info');
    }
  };

  if (!canCoach) {
    return <Navigate to="/dashboard" replace />;
  }

  const activeInvites = invites.filter(i => new Date(i.expires_at) > new Date() && i.use_count < i.max_uses);
  const rosterKey = rosterFilter;
  const filterLabel = rosterKey ? t(`coaching.rosterList.filters.${rosterKey}`) : t('coaching.rosterList.filters.all');
  const setRosterFilter = (next: typeof rosterKey) => {
    navigate(next ? `/clients?filter=${next}` : '/clients');
  };
  const filteredIds = rosterKey
    ? new Set(rosterHitsForFilter(rosterKey, opsRows, priorities, rosterSignals).map(h => h.clientId))
    : null;
  const ownedClients = clients.filter(c =>
    canReadClientDossier({ clientId: c.id, hasActiveRelationship: true }),
  );
  const visibleClients = (filteredIds ? ownedClients.filter(c => filteredIds.has(c.id)) : ownedClients)
    .filter(c => {
      const q = clientQuery.trim().toLowerCase();
      if (!q) return true;
      return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').includes(q);
    });
  const roster = sortRosterClients(visibleClients, {
    opsRows,
    signals: rosterSignals,
    today: todayStr(),
  });
  const rosterBusy = loading || opsLoading;
  const rosterFrom = rosterBackPath(rosterFilter);
  const rosterIds = roster.map(row => row.client.id);
  const openClient = (href: string) => navigate(href, { state: rosterChainState(rosterFrom, rosterIds) });

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('coaching.clientsTitle')}</h1>
            {rosterKey && (
              <p className="text-xs text-blue-300 mt-1">
                {t('coaching.ask.filterActive', { filter: filterLabel, n: roster.length })}
                {' · '}
                <button type="button" className="underline" onClick={() => setRosterFilter(null)}>
                  {t('coaching.ask.clearFilter')}
                </button>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/coach/import')} className="whitespace-nowrap">
              <Upload size={14} aria-hidden="true" /> {t('coaching.importCsv.short')}
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus size={14} /> {t('coaching.invite.cta')}
            </Button>
          </div>
        </div>

        {clients.length > 0 && (
          <input
            type="search"
            ref={searchRef}
            value={clientQuery}
            onChange={e => setClientQuery(e.target.value)}
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            className="mb-3 min-h-11 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-white"
          />
        )}

        {clients.length > 0 && (
          <div
            className="flex flex-wrap gap-2 mb-4"
            role="group"
            aria-label={t('coaching.ask.rosterFilter')}
          >
            <button
              type="button"
              aria-pressed={!rosterKey}
              onClick={() => setRosterFilter(null)}
              className={`min-h-11 px-3 rounded-full text-xs font-medium ${
                !rosterKey ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'
              }`}
            >
              {t('coaching.rosterList.filters.all')}
            </button>
            {ROSTER_FILTERS.map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={rosterKey === key}
                onClick={() => setRosterFilter(key)}
                className={`min-h-11 px-3 rounded-full text-xs font-medium ${
                  rosterKey === key ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'
                }`}
              >
                {t(`coaching.rosterList.filters.${key}`)}
              </button>
            ))}
          </div>
        )}

        {rosterBusy ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-neutral-900 animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="text-center py-10">
            <Users className="mx-auto mb-3 text-neutral-600" size={28} />
            <p className="text-neutral-400 mb-4">{t('coaching.noClients')}</p>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus size={14} /> {t('coaching.invite.cta')}
            </Button>
          </Card>
        ) : roster.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-neutral-400">{t('coaching.ask.roster.empty')}</p>
            {rosterKey && (
              <p className="text-xs text-neutral-500 mt-2">{t('coaching.rosterList.filterWhy', { filter: filterLabel })}</p>
            )}
          </Card>
        ) : (
          <div className="space-y-2">
            {roster.map(row => {
              const c = row.client;
              const ops = opsRows.find(r => r.client.id === c.id);
              const forceSetup = ops ? shouldOpenSetup(ops) : row.forceSetup;
              const goalKind = goalKinds[c.id] ?? null;
              const goal = goalKind ? t(goalKindLabelKey(goalKind)) : null;
              const kcal = row.kcal.kind === 'vs_target'
                ? t('coaching.rosterList.kcalVs', { logged: row.kcal.logged, target: row.kcal.target })
                : row.kcal.kind === 'logged_only'
                  ? t('coaching.rosterList.kcalLogged', { logged: row.kcal.logged })
                  : row.kcal.kind === 'no_logs'
                    ? t('coaching.rosterList.noKcalLogs')
                    : null;
              const program = row.hasProgram
                ? row.programName
                : t('coaching.rosterList.noProgram');
              const meta = [goal, kcal, program].filter(Boolean) as string[];
              return (
              <Card
                key={c.id}
                onClick={() => openClient(forceSetup ? `/clients/${c.id}/setup` : clientFileHref(c.id))}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.full_name[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{c.full_name || c.email || t('coaching.unnamed')}</p>
                    {!c.onboarding_completed && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                        {t('coaching.badgeOnboarding')}
                      </span>
                    )}
                    {c.onboarding_completed && ops && shouldOpenSetup(ops) && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 shrink-0">
                        {t('coaching.badgeSetup')}
                      </span>
                    )}
                    {c.medical_flags && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 shrink-0">
                        {t('coaching.badgeMedical')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    {meta.join(' · ') || c.email}
                  </p>
                </div>
                {forceSetup && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/clients/${c.id}/setup`, { state: rosterChainState(rosterFrom, rosterIds) });
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 shrink-0"
                >
                  {t('coaching.setupCta')}
                </button>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    openClient(clientFileHref(c.id));
                  }}
                  className="text-neutral-600 hover:text-white shrink-0"
                  aria-label={t('coaching.clientsTitle')}
                >
                  <ChevronRight size={16} />
                </button>
              </Card>
              );
            })}
          </div>
        )}
      </div>
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('coaching.invite.generate')} size="sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">{t('coaching.invite.maxUses')}</label>
            <select
              value={maxUses}
              onChange={e => setMaxUses(Number(e.target.value))}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-white"
            >
              {[1, 5, 10, 25].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button size="sm" onClick={handleCreate} loading={creating} className="ml-auto">
              <Plus size={14} /> {t('coaching.invite.create')}
            </Button>
          </div>
          {activeInvites.length > 0 && (
            <div className="space-y-2">
              {activeInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 bg-neutral-900 rounded-xl px-3 py-2">
                  <Link2 size={14} className="text-blue-400 shrink-0" />
                  <p className="text-xs text-neutral-400 flex-1 truncate">
                    {t('coaching.invite.usesLeft', { n: inv.max_uses - inv.use_count })}
                    {' · '}
                    {new Date(inv.expires_at).toLocaleDateString(i18n.language)}
                  </p>
                  <button type="button" onClick={() => copyUrl(inv.token)} aria-label={t('coaching.invite.copyLink')} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-white">
                    <Copy size={16} aria-hidden="true" className={copied === inv.token ? 'text-emerald-400' : ''} />
                  </button>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="text-[11px] text-neutral-500 hover:text-rose-400"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </PageTransition>
  );
}
