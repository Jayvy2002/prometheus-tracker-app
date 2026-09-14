import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Link2,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import CoachRelationshipNotices from './CoachRelationshipNotices';
import CoachTodayQueue from './CoachTodayQueue';
import { formatWeekdayDate } from '../../lib/utils';

export default function CoachDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, opsPartialError, invites,
    fetchCoachOps, fetchInvites, createInvite, fetchCoachSettings,
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
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
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
          <div className="flex flex-wrap items-center gap-2">
            {opsRows.length > 0 && (
            <Button type="button" size="sm" variant="secondary" loading={fleetRunning} onClick={() => void handleFleet()}>
              {t('coaching.fleet.refresh')}
            </Button>
            )}
            <button
              type="button"
              onClick={() => navigate('/prometheus')}
              className="inline-flex items-center gap-1.5 min-h-11 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 hover:text-white"
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
            <CoachTodayQueue />

            {opsPartialError ? (
              <Card className="mt-4 mb-4 border-amber-500/30">
                <p className="text-sm text-amber-200">{t('errors.opsPartial')}</p>
                <button type="button" className="text-xs text-blue-400 mt-2" onClick={() => fetchCoachOps()}>
                  {t('errors.retry')}
                </button>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </PageTransition>
  );
}
