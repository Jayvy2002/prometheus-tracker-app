import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Link2, Users, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { shouldOpenSetup } from '../../lib/coachAlerts';
import { rosterHitsForFilter, type CoachAskFilter } from '../../lib/coachAsk';
import { lastMessageForClient } from '../../lib/coachQueue';
import { liftsForClient } from '../../lib/coachLifts';
import { sparklineValues } from '../../lib/coachProgress';
import { weekMovedLift } from '../../lib/coachTraining';
import { displayName } from '../../lib/coachText';
import { todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import type { CoachClientSummary } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import Sparkline from '../ui/Sparkline';
import { toast } from '../ui/Toast';
import RemoveClientDialog from './RemoveClientDialog';

export default function ClientsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, invites, loading, opsRows, priorities, rosterSignals, sentMessages,
    fetchMyRole, fetchClients, fetchInvites, fetchCoachOps, fetchCoachMessages, createInvite, revokeInvite, enableCoachMode,
    endClientLink,
  } = useCoachingStore();
  const [searchParams] = useSearchParams();
  const rosterFilter = searchParams.get('filter');
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CoachClientSummary | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMyRole(user.id).then(() => {
      fetchClients();
      fetchInvites();
      fetchCoachOps();
      fetchCoachMessages();
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnable = async () => {
    const { error } = await enableCoachMode();
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(t('coaching.coachModeOn'));
  };

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

  const handleRemoveClient = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const result = await endClientLink(removeTarget.id);
    setRemoving(false);
    if (result.error) {
      toast(
        result.error === 'cannot_end_self'
          ? t('coaching.removeClient.cannotSelf')
          : t('coaching.removeClient.error'),
        'error',
      );
      return;
    }
    toast(t('coaching.removeClient.removed', { name: displayName(removeTarget, t('coaching.unnamed')) }));
    setRemoveTarget(null);
  };

  if (coachingRole !== 'coach') {
    return (
      <PageTransition>
        <div className="px-4 pt-6">
          <h1 className="text-2xl font-bold text-white mb-2">{t('coaching.clientsTitle')}</h1>
          <Card className="text-center py-10">
            <Users className="mx-auto mb-3 text-neutral-600" size={32} />
            <p className="text-neutral-300 mb-2">{t('coaching.enableTitle')}</p>
            <p className="text-sm text-neutral-500 mb-5">{t('coaching.enableBody')}</p>
            <Button onClick={handleEnable}>{t('coaching.enableCta')}</Button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const activeInvites = invites.filter(i => new Date(i.expires_at) > new Date() && i.use_count < i.max_uses);
  const rosterKey = (rosterFilter === 'pain' || rosterFilter === 'stalled' || rosterFilter === 'adherence'
    || rosterFilter === 'missed' || rosterFilter === 'weight' || rosterFilter === 'checkin')
    ? rosterFilter as CoachAskFilter
    : null;
  const filteredIds = rosterKey
    ? new Set(rosterHitsForFilter(rosterKey, opsRows, priorities, rosterSignals).map(h => h.clientId))
    : null;
  const visibleClients = filteredIds ? clients.filter(c => filteredIds.has(c.id)) : clients;

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('coaching.clientsTitle')}</h1>
            {rosterFilter && (
              <p className="text-xs text-blue-300 mt-1">
                {t('coaching.ask.filterActive', { filter: rosterFilter, n: visibleClients.length })}
                {' · '}
                <button type="button" className="underline" onClick={() => navigate('/clients')}>
                  {t('coaching.ask.clearFilter')}
                </button>
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus size={14} /> {t('coaching.invite.cta')}
          </Button>
        </div>

        {loading ? (
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
        ) : visibleClients.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-neutral-400">{t('coaching.ask.roster.empty')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleClients.map(c => {
              const ops = opsRows.find(r => r.client.id === c.id);
              const forceSetup = ops ? shouldOpenSetup(ops) : !c.onboarding_completed;
              const lastMessage = lastMessageForClient(sentMessages, c.id);
              const moved = weekMovedLift(liftsForClient(rosterSignals.lifts, c.id), todayStr());
              const movedSpark = moved ? sparklineValues(moved, 'topSet') : [];
              return (
              <Card
                key={c.id}
                onClick={() => navigate(forceSetup ? `/clients/${c.id}/setup` : clientFileHref(c.id))}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.full_name[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{c.full_name || c.email || t('coaching.unnamed')}</p>
                    {!c.onboarding_completed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                        {t('coaching.badgeOnboarding')}
                      </span>
                    )}
                    {c.onboarding_completed && ops && shouldOpenSetup(ops) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 shrink-0">
                        {t('coaching.badgeSetup')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 truncate">
                    {lastMessage?.body || c.email}
                  </p>
                </div>
                {moved && movedSpark.length >= 2 && (
                  <div className="shrink-0 text-right max-w-[96px]">
                    <p className="text-[10px] text-neutral-500 truncate">{moved.displayName}</p>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[10px] text-neutral-400">{moved.sessions[0]?.bestSet}</span>
                      <Sparkline values={movedSpark} width={56} height={20} />
                    </div>
                  </div>
                )}
                {forceSetup && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/clients/${c.id}/setup`);
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 shrink-0"
                >
                  {t('coaching.setupCta')}
                </button>
                )}
                {user && c.id !== user.id && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setRemoveTarget(c);
                    }}
                    className="p-1.5 text-neutral-600 hover:text-rose-400 shrink-0"
                    aria-label={t('coaching.removeClient.action')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(clientFileHref(c.id));
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
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                  <button onClick={() => copyUrl(inv.token)} className="p-1.5 text-neutral-400 hover:text-white">
                    <Copy size={14} className={copied === inv.token ? 'text-emerald-400' : ''} />
                  </button>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="text-[10px] text-neutral-500 hover:text-rose-400"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <RemoveClientDialog
        open={!!removeTarget}
        clientName={removeTarget ? displayName(removeTarget, t('coaching.unnamed')) : ''}
        removing={removing}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveClient}
      />
    </PageTransition>
  );
}
