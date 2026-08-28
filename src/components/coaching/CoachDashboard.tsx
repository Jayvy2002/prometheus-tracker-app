import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ClipboardCheck,
  Copy,
  Link2,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { interventionHref, isCoachOnlyKind, payloadSummary } from '../../lib/coachInterventions';
import type { CoachPriority, CoachPrioritySeverity } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const SEVERITY_DOT: Record<CoachPrioritySeverity, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
};

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

function PriorityRow({ item, open, onToggle, onOpen }: {
  item: CoachPriority;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <span className="text-base leading-6 shrink-0" aria-hidden>{SEVERITY_DOT[item.severity]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {t(item.headlineKey, item.headlineParams)}
          </p>
          <p className="text-[11px] text-neutral-500 truncate">{item.clientName}</p>
        </div>
        <ChevronRight size={16} className={`text-neutral-600 mt-1 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-neutral-800/60">
          <p className="text-xs text-neutral-400 mt-2">{t(item.detailKey, item.detailParams)}</p>
          <button
            type="button"
            onClick={onOpen}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            {t('coaching.command.openClient')}
          </button>
        </div>
      )}
    </Card>
  );
}

export default function CoachDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, invites, pendingInterventions, clients,
    fetchCoachOps, fetchInvites, createInvite, commandStats: stats,
    priorities,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchInvites();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeInvites = invites.filter(i => new Date(i.expires_at) > new Date() && i.use_count < i.max_uses);
  const topDrafts = pendingInterventions.slice(0, 4);
  const visiblePriorities = useMemo(() => priorities.slice(0, 12), [priorities]);

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
              <StatCard label={t('coaching.command.stats.checkins')} value={stats.checkinsToReview} tone="blue" />
              <StatCard label={t('coaching.command.stats.adapt')} value={stats.programsMayAdapt} tone="amber" />
              <StatCard label={t('coaching.command.stats.important')} value={stats.important} tone="rose" />
            </div>

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
                    const coachOnly = isCoachOnlyKind(item.kind);
                    return (
                      <Card key={item.id} onClick={() => navigate(interventionHref(item))} className="flex items-start gap-3">
                        <Sparkles size={16} className={`mt-1 shrink-0 ${coachOnly ? 'text-violet-400' : 'text-blue-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {item.title || t(`coaching.interventions.kinds.${item.kind}`)}
                          </p>
                          <p className="text-[11px] text-neutral-500 truncate">
                            {client?.full_name || client?.email || t('coaching.interventions.appWide')}
                            {' · '}
                            {payloadSummary(item)}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-neutral-600 mt-1 shrink-0" />
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                {t('coaching.command.priorities')}
              </p>
              <button onClick={() => navigate('/clients')} className="text-xs text-blue-400">
                {t('nav.clients')}
              </button>
            </div>

            {visiblePriorities.length === 0 ? (
              <Card className="flex items-center gap-3">
                <ClipboardCheck size={18} className="text-emerald-400" />
                <div>
                  <p className="text-sm text-white">{t('coaching.command.allClearTitle')}</p>
                  <p className="text-xs text-neutral-500">{t('coaching.command.allClearBody')}</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {visiblePriorities.map(item => (
                  <PriorityRow
                    key={item.id}
                    item={item}
                    open={expanded === item.id}
                    onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                    onOpen={() => navigate(item.href)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
