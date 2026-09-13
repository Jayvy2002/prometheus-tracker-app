import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserMinus, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { linkEndedAckKey, linkEndedNotice } from '../../lib/soloTransition';

function readAck(userId: string): string | null {
  try {
    return localStorage.getItem(linkEndedAckKey(userId));
  } catch {
    return null;
  }
}

/**
 * Shown once on the solo home after the coaching link ended: what happened, what they keep,
 * and the solo trial window (no billing wall until that chantier opens).
 */
export default function LinkEndedBanner() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const profile = useProfileStore(s => s.profile);
  const myCoach = useCoachingStore(s => s.myCoach);
  const [acked, setAcked] = useState<string | null>(() => (user ? readAck(user.id) : null));

  if (!user) return null;
  const notice = linkEndedNotice({ profile, hasCoach: !!myCoach, ackedEndedAt: acked });
  if (!notice.show || !notice.endedAt) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(linkEndedAckKey(user.id), notice.endedAt ?? '');
    } catch {
      // private mode / quota
    }
    setAcked(notice.endedAt);
  };

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 animate-fade-in-scale">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <UserMinus size={16} className="text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('dashboard.linkEnded.title')}</p>
          <p className="text-xs text-neutral-300 mt-1 whitespace-pre-line">{t('dashboard.linkEnded.body')}</p>
          {notice.trialDaysLeft != null && (
            <p className="text-xs text-amber-200 mt-2">
              {notice.trialExpired
                ? t('dashboard.linkEnded.trialOver')
                : t('dashboard.linkEnded.trial', { days: notice.trialDaysLeft })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-md text-neutral-500 hover:text-neutral-300"
          aria-label={t('common.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
