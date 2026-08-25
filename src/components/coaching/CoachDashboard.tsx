import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Dumbbell,
  Link2,
  Plus,
  Scale,
  Users,
  Utensils,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { isSetupAlert, needsSetup } from '../../lib/coachAlerts';
import type { ClientAlertKind, ClientOpsRow } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const ALERT_ICONS: Record<ClientAlertKind, typeof AlertTriangle> = {
  onboarding_incomplete: Users,
  program_unassigned: ClipboardCheck,
  missing_checkin: ClipboardCheck,
  missing_workout_today: Dumbbell,
  missing_workout_week: Dumbbell,
  missing_weight: Scale,
  missing_nutrition: Utensils,
};

function ClientAvatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  return (
    <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        : (name[0] || '?').toUpperCase()}
    </div>
  );
}

function AlertPills({ alerts }: { alerts: ClientAlertKind[] }) {
  const { t } = useTranslation();
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {alerts.map(kind => {
        const Icon = ALERT_ICONS[kind];
        return (
          <span
            key={kind}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
              isSetupAlert(kind)
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            <Icon size={10} />
            {t(`coaching.alerts.${kind}`)}
          </span>
        );
      })}
    </div>
  );
}

export default function CoachDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, invites,
    fetchCoachOps, fetchInvites, createInvite,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchInvites();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const withAlerts = useMemo(() => opsRows.filter(r => r.alerts.length > 0), [opsRows]);
  const allClear = useMemo(() => opsRows.filter(r => r.alerts.length === 0), [opsRows]);
  const setupRows = useMemo(() => opsRows.filter(needsSetup), [opsRows]);
  const onboardingRows = useMemo(
    () => opsRows.filter(r => !r.client.onboarding_completed),
    [opsRows],
  );

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

  const openClient = (row: ClientOpsRow) => {
    if (needsSetup(row) || !row.client.onboarding_completed) {
      navigate(`/clients/${row.client.id}/setup`);
      return;
    }
    navigate(`/clients/${row.client.id}`);
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <div className="mb-6">
          <p className="text-neutral-400 text-xs">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-bold text-white">{t('coaching.ops.title')}</h1>
          <p className="text-sm text-neutral-500 mt-1">{t('coaching.ops.subtitle')}</p>
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
            <button
              onClick={() => navigate('/clients')}
              className="mt-4 text-sm text-blue-400"
            >
              {t('coaching.ops.manageInvites')}
            </button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="!p-3">
                <p className="text-[11px] text-neutral-500 uppercase tracking-wider">{t('coaching.ops.withAlerts')}</p>
                <p className="text-2xl font-bold text-amber-300 mt-1">{withAlerts.length}</p>
              </Card>
              <Card className="!p-3">
                <p className="text-[11px] text-neutral-500 uppercase tracking-wider">{t('coaching.ops.allClear')}</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{allClear.length}</p>
              </Card>
            </div>
            {(setupRows.length > 0 || onboardingRows.length > 0) && (
              <p className="text-xs text-amber-300/80 mb-4">
                {t('coaching.ops.setupSummary', {
                  onboarding: onboardingRows.length,
                  setup: setupRows.length,
                })}
              </p>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                {t('coaching.ops.clients')}
              </p>
              <button onClick={() => navigate('/clients')} className="text-xs text-blue-400">
                {t('coaching.invite.generate')}
              </button>
            </div>

            <div className="space-y-2">
              {[...opsRows]
                .sort((a, b) => {
                  const score = (r: ClientOpsRow) =>
                    (!r.client.onboarding_completed ? 0 : needsSetup(r) ? 1 : r.alerts.length > 0 ? 2 : 3);
                  return score(a) - score(b);
                })
                .map(row => (
                  <Card key={row.client.id} onClick={() => openClient(row)} className="flex items-start gap-3">
                    <ClientAvatar name={row.client.full_name || row.client.email} avatarUrl={row.client.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white truncate">
                          {row.client.full_name || row.client.email || t('coaching.unnamed')}
                        </p>
                        {row.alerts.length === 0 && (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 truncate">{row.client.email}</p>
                      {row.alerts.length === 0 ? (
                        <p className="text-[11px] text-emerald-400/80 mt-1">{t('coaching.ops.loggingOk')}</p>
                      ) : (
                        <AlertPills alerts={row.alerts} />
                      )}
                    </div>
                    <ChevronRight size={16} className="text-neutral-600 mt-2 shrink-0" />
                  </Card>
                ))}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
