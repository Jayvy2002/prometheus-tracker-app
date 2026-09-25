import { openGlobalSearch } from '../../features/search/openSearch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Dumbbell,
  Inbox,
  Link2,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { countRequestsAwaitingCoach } from '../../features/marketplace/domain/marketplaceApi';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import IconButton from '../ui/IconButton';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import { ListSkeleton } from '../ui/PageSkeleton';
import CoachRelationshipNotices from './CoachRelationshipNotices';
import CoachTodayQueue from './CoachTodayQueue';
import { formatWeekdayDate } from '../../lib/utils';
import ListRow from '../ui/ListRow';
import { sessionsTodayRows } from '../../features/coaching/domain/coachDayQueue';

const SESSIONS_TODAY_SHOWN = 8;

export default function CoachDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, opsPartialError, invites, rosterSignals, messagesFetchError,
    fetchCoachOps, fetchInvites, createInvite, fetchCoachSettings, fetchCoachMessages,
    coachingRoleError, fetchMyRole,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [prospects, setProspects] = useState(0);
  const [prospectsError, setProspectsError] = useState(false);
  const userId = user?.id ?? null;

  // A prospect waiting on the coach is a decision (Vision §15.1). A failed
  // count is said as such; it never pretends there is nobody waiting.
  const loadProspects = useCallback(() => {
    if (!userId) return () => undefined;
    let cancelled = false;
    countRequestsAwaitingCoach(userId)
      .then(n => { if (!cancelled) { setProspects(n); setProspectsError(false); } })
      .catch(() => { if (!cancelled) { setProspects(0); setProspectsError(true); } });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
    fetchInvites();
    fetchCoachSettings();
    void fetchCoachMessages();
    return loadProspects();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionsToday = useMemo(() => sessionsTodayRows(opsRows, rosterSignals), [opsRows, rosterSignals]);
  // No roster at all because it failed to load ≠ no client yet.
  const rosterFailed = !opsLoading && !!opsPartialError && opsRows.length === 0;
  const partial = (!!opsPartialError && opsRows.length > 0) || messagesFetchError || prospectsError;
  const retryAll = () => {
    fetchCoachOps();
    void fetchCoachMessages();
    loadProspects();
  };

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
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => user && fetchMyRole(user.id)}>
                {t('errors.loadRole')} · {t('errors.retry')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label={t('common.search')} onClick={openGlobalSearch}>
              <Search size={18} />
            </IconButton>
            <Button type="button" variant="secondary" size="sm" aria-label={t('soloAsk.label')} onClick={() => navigate('/prometheus')}>
              <Sparkles size={16} aria-hidden="true" />
              <span aria-hidden="true">{t('soloAsk.short')}</span>
            </Button>
          </div>
        </div>

        <CoachRelationshipNotices />

        {prospects > 0 && (
          <div className="mb-3" data-testid="coach-prospects-waiting">
            <ListRow
              icon={<Inbox size={16} />}
              tone="info"
              title={t('coaching.command.prospectsWaiting', { count: prospects })}
              subtitle={t('coaching.command.prospectsWaitingHint')}
              to="/coaching-requests"
            />
          </div>
        )}

        {opsLoading ? (
          <ListSkeleton />
        ) : rosterFailed ? (
          <ErrorState title={t('coaching.command.loadError')} onRetry={retryAll} />
        ) : opsRows.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              title={t('coaching.ops.emptyTitle')}
              body={t('coaching.ops.emptyBody')}
              action={(
                <Button onClick={handleCreate} loading={creating}>
                  <Plus size={14} /> {t('coaching.invite.create')}
                </Button>
              )}
            />
            {activeInvites.length > 0 && (
              <div className="space-y-2">
                {activeInvites.map(inv => (
                  <ListRow
                    key={inv.id}
                    icon={<Link2 size={16} />}
                    tone="info"
                    title={t('coaching.invite.usesLeft', { n: inv.max_uses - inv.use_count })}
                    trailing={(
                      <IconButton label={t('coaching.invite.copyLink')} onClick={() => copyUrl(inv.token)}>
                        <Copy size={16} className={copied === inv.token ? 'text-emerald-400' : ''} />
                      </IconButton>
                    )}
                  />
                ))}
              </div>
            )}
            {prospectsError ? (
              <PartialNotice onRetry={retryAll} />
            ) : null}
          </div>
        ) : (
          <>
            <CoachTodayQueue otherDecisions={prospects} incomplete={partial} />

            {partial ? <PartialNotice onRetry={retryAll} /> : null}

            {sessionsToday.length > 0 && (
              <section className="mt-6" aria-labelledby="coach-sessions-today" data-testid="coach-sessions-today">
                <h2 id="coach-sessions-today" className="text-sm font-semibold text-neutral-300">
                  {t('coaching.command.sessionsTodayTitle', { count: sessionsToday.length })}
                </h2>
                <p className="text-xs text-neutral-500 mb-3">{t('coaching.command.sessionsTodayHint')}</p>
                <div className="space-y-2">
                  {sessionsToday.slice(0, SESSIONS_TODAY_SHOWN).map(row => (
                    <ListRow
                      key={row.clientId}
                      icon={<Dumbbell size={16} />}
                      title={row.clientName}
                      subtitle={row.programName
                        ? t('coaching.command.sessionToday', { program: row.programName })
                        : t('coaching.command.sessionTodayNoName')}
                      to={row.href}
                    />
                  ))}
                </div>
                {sessionsToday.length > SESSIONS_TODAY_SHOWN ? (
                  <p className="text-xs text-neutral-500 mt-2">
                    {t('coaching.command.sessionsTodayMore', { count: sessionsToday.length - SESSIONS_TODAY_SHOWN })}
                  </p>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

function PartialNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4" role="alert">
      <p className="text-sm text-amber-200">{t('coaching.command.partialError')}</p>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
        {t('errors.retry')}
      </Button>
    </div>
  );
}
