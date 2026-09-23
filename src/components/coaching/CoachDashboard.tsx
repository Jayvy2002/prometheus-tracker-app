import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Link2,
  Plus,
  Search,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import IconButton from '../ui/IconButton';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import { ListSkeleton } from '../ui/PageSkeleton';
import CoachRelationshipNotices from './CoachRelationshipNotices';
import CoachTodayQueue from './CoachTodayQueue';
import { formatWeekdayDate } from '../../lib/utils';
import ListRow from '../ui/ListRow';

export default function CoachDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    opsRows, opsLoading, opsPartialError, invites,
    fetchCoachOps, fetchInvites, createInvite, fetchCoachSettings,
    coachingRoleError, fetchMyRole,
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
            <IconButton label={t('common.search')} onClick={() => navigate('/clients?search=1')}>
              <Search size={18} />
            </IconButton>
            <IconButton label={t('coaching.ask.shortcut')} onClick={() => navigate('/prometheus')}>
              <Search size={18} />
            </IconButton>
          </div>
        </div>

        <CoachRelationshipNotices />

        {opsLoading ? (
          <ListSkeleton />
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
          </div>
        ) : (
          <>
            <CoachTodayQueue />

            {opsPartialError ? (
              <Card className="mt-4 mb-4 border-amber-500/30">
                <p className="text-sm text-amber-200">{t('errors.opsPartial')}</p>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => fetchCoachOps()}>
                  {t('errors.retry')}
                </Button>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </PageTransition>
  );
}
