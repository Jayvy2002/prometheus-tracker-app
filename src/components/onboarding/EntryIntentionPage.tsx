import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAuthStore } from '../../stores/authStore';
import { getSessionOwner } from '../../lib/sessionScope';
import Button from '../ui/Button';

export default function EntryIntentionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owner = useAuthStore(s => s.user?.id);
  const choose = useCoachingStore(s => s.chooseEntryIntention);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  async function select(intent: 'solo' | 'find_coach' | 'coach') {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError(false);
    try {
      const result = await choose(intent);
      if (owner !== getSessionOwner()) return;
      if (result.error) { setError(true); return; }
      navigate(intent === 'find_coach' ? '/coaches' : '/dashboard', { replace: true });
    } finally { writing.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
    <div className="max-w-lg w-full space-y-5">
      <h1 className="text-2xl font-semibold">{t('entryIntention.title')}</h1>
      {error && <p role="alert" className="text-rose-300">{t('entryIntention.error')}</p>}
      {(['solo', 'find_coach', 'coach'] as const).map(intent => <Button key={intent} className="w-full justify-start text-left min-h-24" variant="secondary" disabled={busy} onClick={() => { void select(intent); }}>
        <span><span className="block font-semibold">{t(`entryIntention.${intent}`)}</span><span className="block text-sm text-neutral-400 font-normal mt-2">{t(`entryIntention.${intent}Hint`)}</span></span>
      </Button>)}
    </div>
  </main>;
}
