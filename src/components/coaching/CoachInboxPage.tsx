import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { inboxItems } from '../../lib/coachPriorities';
import { interventionHref, isCoachOnlyKind, payloadSummary } from '../../lib/coachInterventions';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

export default function CoachInboxPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { fetchCoachOps, priorities, pendingInterventions, clients } = useCoachingStore();

  useEffect(() => {
    if (!user) return;
    fetchCoachOps();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => inboxItems(priorities), [priorities]);

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.inbox.title')}</h1>
        <p className="text-sm text-neutral-500 mb-5">{t('coaching.inbox.subtitle')}</p>

        {pendingInterventions.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
              {t('coaching.interventions.title')}
            </p>
            <div className="space-y-2">
              {pendingInterventions.map(item => {
                const client = clients.find(c => c.id === item.client_id);
                return (
                  <Card key={item.id} onClick={() => navigate(interventionHref(item))} className="flex items-start gap-3">
                    <Sparkles size={16} className={`mt-1 ${isCoachOnlyKind(item.kind) ? 'text-violet-400' : 'text-blue-400'}`} />
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
                    <ChevronRight size={16} className="text-neutral-600 mt-1" />
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
          {t('coaching.inbox.signals')}
        </p>
        {items.length === 0 ? (
          <Card className="flex items-center gap-3">
            <ClipboardCheck size={18} className="text-emerald-400" />
            <p className="text-sm text-neutral-300">{t('coaching.inbox.empty')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <Card key={item.id} onClick={() => navigate(item.href)} className="flex items-start gap-3">
                <span className="text-base" aria-hidden>
                  {item.severity === 'red' ? '🔴' : item.severity === 'orange' ? '🟠' : '🟡'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{t(item.headlineKey, item.headlineParams)}</p>
                  <p className="text-[11px] text-neutral-500 truncate">{t(item.detailKey, item.detailParams)}</p>
                </div>
                <ChevronRight size={16} className="text-neutral-600 mt-1" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
