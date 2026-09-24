import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Search, Users } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAuthStore } from '../../stores/authStore';
import { getSessionOwner } from '../../lib/sessionScope';
import Button from '../ui/Button';

const INTENTS = [
  { id: 'solo' as const, icon: Dumbbell, cta: 'soloCta' },
  { id: 'find_coach' as const, icon: Search, cta: 'find_coachCta' },
  { id: 'coach' as const, icon: Users, cta: 'coachCta' },
];

export default function EntryIntentionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owner = useAuthStore(s => s.user?.id);
  const choose = useCoachingStore(s => s.chooseEntryIntention);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<typeof INTENTS[number]['id'] | null>(null);
  const writing = useRef(false);

  async function select(intent: 'solo' | 'find_coach' | 'coach') {
    if (writing.current) return;
    writing.current = true;
    setBusy(intent);
    setError(false);
    try {
      const result = await choose(intent);
      if (owner !== getSessionOwner()) return;
      if (result.error) {
        setError(true);
        return;
      }
      navigate(intent === 'find_coach' ? '/coaches' : '/dashboard', { replace: true });
    } finally {
      writing.current = false;
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">{t('entryIntention.title')}</h1>
          {/* Vision §5.1: the intention opens a path, it does not lock an identity. */}
          <p className="mt-2 text-sm text-neutral-400" data-testid="entry-intention-reassurance">{t('entryIntention.changeLater')}</p>
        </div>
        {error && <p role="alert" className="text-rose-300 text-center">{t('entryIntention.error')}</p>}
        <div className="space-y-3">
          {INTENTS.map(item => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 space-y-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center shrink-0">
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white">{t(`entryIntention.${item.id}`)}</h2>
                    <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
                      {t(`entryIntention.${item.id}Hint`)}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full min-h-11"
                  variant={item.id === 'solo' ? 'primary' : 'secondary'}
                  disabled={busy !== null}
                  loading={busy === item.id}
                  onClick={() => { void select(item.id); }}
                >
                  {t(`entryIntention.${item.cta}`)}
                </Button>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
