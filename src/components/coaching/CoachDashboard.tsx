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
import { checkinReviewRows, formatCheckinScore } from '../../lib/coachCheckins';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import CoachRelationshipNotices from './CoachRelationshipNotices';
import CoachTodayQueue from './CoachTodayQueue';
import { formatWeekdayDate } from '../../lib/utils';

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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, opsPartialError, invites, priorities, rosterSignals,
    fetchCoachOps, fetchInvites, createInvite, commandStats: stats, fetchCoachSettings,
    runFleetRound, fleetRunning, coachingRoleError, fetchMyRole,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchInvites();
    fetchCoachSettings();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeInvites = invites.filter(i => new Date(i.expires_at) > new Date() && i.use_count < i.max_uses);
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

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-neutral-400 text-xs">
              {formatWeekdayDate(new Date(), i18n.language)}
            </p>
            <h1 className="text-2xl font-bold text-white">{t('coaching.command.title')}</h1>
            <p className="text-sm text-neutral-500 mt-1">{t('coaching.command.subtitle')}</p>
            {coachingRoleError ? (
              <button type="button" className="text-xs text-amber-300 mt-2" onClick={() => user && fetchMyRole(user.id)}>
                {t('errors.loadRole')} · {t('errors.retry')}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" size="sm" variant="secondary" loading={fleetRunning} onClick={() => void handleFleet()}>
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
          </div>
        </div>

        <CoachRelationshipNotices />

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
            <div className={`grid grid-cols-2 gap-3 mb-6 ${stats.checkinsToReview > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              <StatCard label={t('coaching.command.stats.active')} value={stats.activeClients} />
              <StatCard label={t('coaching.command.stats.attention')} value={stats.needAttention} tone="amber" />
              {stats.checkinsToReview > 0 && (
                <button type="button" className="text-left" onClick={() => document.getElementById('checkins-a-relire')?.scrollIntoView({ behavior: 'smooth' })}>
                  <StatCard label={t('coaching.command.stats.checkins')} value={stats.checkinsToReview} tone="blue" />
                </button>
              )}
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
                          {t(`coaching.checkinReview.kinds.${row.kind}`, { n: formatCheckinScore(row.checkin.joint_pain, row.checkin) })}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-neutral-600 mt-1 shrink-0" />
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {opsPartialError ? (
              <Card className="mb-4 border-amber-500/30">
                <p className="text-sm text-amber-200">{t('errors.opsPartial')}</p>
                <button type="button" className="text-xs text-blue-400 mt-2" onClick={() => fetchCoachOps()}>
                  {t('errors.retry')}
                </button>
              </Card>
            ) : null}

            <CoachTodayQueue />
          </>
        )}
      </div>
    </PageTransition>
  );
}
