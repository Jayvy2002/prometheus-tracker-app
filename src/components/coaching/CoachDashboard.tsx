import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Copy,
  Link2,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { coachingPassHref, isCompleteCalorieDraft, parseCalorieDraft } from '../../lib/coachInterventions';
import { isRelanceKind, parsePreparedMessage, preparedTemplateKey } from '../../lib/coachFleet';
import { checkinReviewRows } from '../../lib/coachCheckins';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import CoachTodayQueue from './CoachTodayQueue';
import InterventionInboxCard from './InterventionInboxCard';

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'rose' | 'blue' | 'white' }) {
  const color = tone === 'amber' ? 'text-amber-300'
    : tone === 'rose' ? 'text-rose-300'
    : tone === 'blue' ? 'text-blue-300'
    : 'text-white';
  return (
    <Card className="!p-3 min-w-0">
      <p className="text-[11px] text-neutral-500 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  );
}

export default function CoachDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, invites, pendingInterventions, clients, priorities,
    fetchCoachOps, fetchInvites, createInvite, commandStats: stats, fetchCoachSettings, coachSettings,
    rosterSignals, runFleetRound, fleetRunning, sendCoachMessage, resolveIntervention,
    setClientNutritionTargets,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchInvites();
    fetchCoachSettings();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeInvites = invites.filter(i => new Date(i.expires_at) > new Date() && i.use_count < i.max_uses);
  const topDrafts = pendingInterventions.slice(0, 4);
  const reviewRows = useMemo(
    () => checkinReviewRows(opsRows, rosterSignals, priorities),
    [opsRows, rosterSignals, priorities],
  );

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

  const handleCreate = async () => {
    setCreating(true);
    const result = await createInvite({ days: 7, maxUses: 1 });
    setCreating(false);
    if ('error' in result) {
      toast(result.error, 'error');
      return;
    }
    await copyUrl(result.token);
  };

  const handleFleet = async () => {
    const result = await runFleetRound();
    if (result.error) {
      toast(t('coaching.fleet.failed'), 'error');
      return;
    }
    toast(t('coaching.fleet.done', {
      flagged: result.clients_flagged ?? 0,
      skipped: result.clients_skipped ?? 0,
    }));
  };

  const handleSendCard = async (item: typeof pendingInterventions[number]) => {
    if (!item.client_id) {
      navigate(coachingPassHref(item));
      return;
    }
    setSendingId(item.id);
    if (isRelanceKind(item.kind)) {
      const body = parsePreparedMessage(item.payload);
      const sent = await sendCoachMessage(item.client_id, body, preparedTemplateKey(item.payload, item.kind));
      if (sent.error) {
        setSendingId(null);
        toast(sent.error === 'empty' ? t('coaching.queue.emptyBody') : sent.error, 'error');
        return;
      }
      const resolved = await resolveIntervention(item.id, 'sent', item.payload);
      setSendingId(null);
      if (resolved.error) {
        toast(resolved.error, 'error');
        return;
      }
      toast(t('coaching.queue.sent'));
      return;
    }
    if (item.kind === 'calorie_adjustment') {
      const cals = parseCalorieDraft(item.payload);
      if (!isCompleteCalorieDraft(cals) || !cals) {
        setSendingId(null);
        navigate(coachingPassHref(item));
        return;
      }
      const applied = await setClientNutritionTargets(item.client_id, cals);
      if (applied.error) {
        setSendingId(null);
        toast(applied.error, 'error');
        return;
      }
      const resolved = await resolveIntervention(item.id, 'sent', item.payload);
      setSendingId(null);
      if (resolved.error) {
        toast(resolved.error, 'error');
        return;
      }
      toast(t('coaching.interventions.sent'));
      return;
    }
    setSendingId(null);
    navigate(coachingPassHref(item));
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-neutral-400 text-xs">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="text-2xl font-bold text-white">{t('coaching.command.title')}</h1>
            <p className="text-sm text-neutral-500 mt-1">{t('coaching.command.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="secondary" loading={fleetRunning} onClick={() => void handleFleet()}>
              {t('coaching.fleet.run')}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/prometheus')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 hover:text-white"
            >
              <Search size={14} />
              {t('coaching.ask.shortcut')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="text-[11px] text-neutral-500 hover:text-white"
            >
              {t('nav.profile')}
            </button>
          </div>
        </div>

        {opsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}
          </div>
        ) : opsRows.length === 0 ? (
          <Card className="text-center py-10">
            <Users className="mx-auto mb-3 text-neutral-600" size={32} />
            <p className="text-neutral-300 mb-1">{t('coaching.ops.emptyTitle')}</p>
            <p className="text-sm text-neutral-500 mb-5">{t('coaching.ops.emptyBody')}</p>
            <Button onClick={handleCreate} loading={creating}>
              <Plus size={14} /> {t('coaching.invite.create')}
            </Button>
            {activeInvites.length > 0 && (
              <div className="mt-4 space-y-2 text-left">
                {activeInvites.map(inv => (
                  <div key={inv.id} className="flex items-center gap-2 bg-neutral-900 rounded-xl px-3 py-2">
                    <Link2 size={14} className="text-blue-400 shrink-0" />
                    <p className="text-xs text-neutral-400 flex-1 truncate">
                      {t('coaching.invite.usesLeft', { n: inv.max_uses - inv.use_count })}
                    </p>
                    <button onClick={() => copyUrl(inv.token)} className="p-1.5 text-neutral-400 hover:text-white">
                      <Copy size={14} className={copied === inv.token ? 'text-emerald-400' : ''} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatCard label={t('coaching.command.stats.active')} value={stats.activeClients} />
              <StatCard label={t('coaching.command.stats.attention')} value={stats.needAttention} tone="amber" />
              <button type="button" className="text-left" onClick={() => document.getElementById('checkins-a-relire')?.scrollIntoView({ behavior: 'smooth' })}>
                <StatCard label={t('coaching.command.stats.checkins')} value={stats.checkinsToReview} tone="blue" />
              </button>
              <StatCard label={t('coaching.command.stats.adapt')} value={stats.programsMayAdapt} tone="amber" />
              <StatCard label={t('coaching.command.stats.important')} value={stats.important} tone="rose" />
            </div>

            {reviewRows.length > 0 && (
              <div id="checkins-a-relire" className="mb-6">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-3">
                  {t('coaching.checkinReview.title')}
                </p>
                <div className="space-y-2">
                  {reviewRows.slice(0, 6).map(row => (
                    <Card key={row.checkin.id} onClick={() => navigate(row.href)} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-300 font-semibold text-sm shrink-0">
                        {row.avatarUrl
                          ? <img src={row.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : (row.clientName[0] || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{row.clientName}</p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          {row.checkin.checked_at}
                          {' · '}
                          {t(`coaching.checkinReview.kinds.${row.kind}`, { n: row.checkin.joint_pain ?? '—' })}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-neutral-600 mt-1 shrink-0" />
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {topDrafts.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                    {t('coaching.interventions.title')}
                  </p>
                  <button onClick={() => navigate('/messages')} className="text-xs text-blue-400">
                    {t('coaching.inbox.seeAll')}
                  </button>
                </div>
                <div className="space-y-2">
                  {topDrafts.map(item => {
                    const client = clients.find(c => c.id === item.client_id);
                    return (
                      <InterventionInboxCard
                        key={item.id}
                        item={item}
                        clientName={client?.full_name || client?.email || t('coaching.interventions.appWide')}
                        sending={sendingId === item.id}
                        onSend={handleSendCard}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {coachSettings?.queue_mode_default === false ? (
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
                  {t('coaching.command.priorities')}
                </p>
                {priorities.length === 0 ? (
                  <CoachTodayQueue />
                ) : (
                  <div className="space-y-2">
                    {priorities.slice(0, 8).map(item => (
                      <Card key={item.id} onClick={() => navigate(item.href)} className="flex items-start gap-3">
                        <span aria-hidden>{item.severity === 'red' ? '🔴' : item.severity === 'orange' ? '🟠' : '🟡'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{t(item.headlineKey, item.headlineParams)}</p>
                          <p className="text-[11px] text-neutral-500 truncate">{t(item.detailKey, item.detailParams)}</p>
                        </div>
                        <ChevronRight size={16} className="text-neutral-600 mt-1 shrink-0" />
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <CoachTodayQueue />
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
