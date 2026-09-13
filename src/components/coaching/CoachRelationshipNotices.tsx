import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import Card from '../ui/Card';

type Notice = { id: string; client_name: string; ended_at: string };

export default function CoachRelationshipNotices() {
  const userId = useAuthStore(s => s.user?.id);
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<{ owner?: string; rows: Notice[]; failed: boolean }>({
    rows: [],
    failed: false,
  });
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const epoch = useRef(0);

  useEffect(() => {
    const generation = ++epoch.current;
    locks.current.clear();
    setPending([]);
    if (!userId) return;
    let request = 0;
    let disposed = false;
    const load = async () => {
      const ticket = ++request;
      try {
        const { data, error } = await supabase.from('coach_relationship_notices')
          .select('id,client_name,ended_at')
          .eq('coach_id', userId)
          .is('read_at', null)
          .order('ended_at', { ascending: false })
          .limit(20);
        if (disposed || ticket !== request || useAuthStore.getState().user?.id !== userId) return;
        if (error) throw error;
        setState({ owner: userId, rows: data as Notice[], failed: false });
      } catch {
        if (!disposed && ticket === request && useAuthStore.getState().user?.id === userId) {
          setState(s => ({ owner: userId, rows: s.owner === userId ? s.rows : [], failed: true }));
        }
      }
    };
    void load();
    const onFocus = () => { if (!document.hidden) void load(); };
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(onFocus, 60000);
    return () => {
      disposed = true;
      epoch.current = generation + 1;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [userId, revision]);

  const dismiss = async (id: string) => {
    if (!userId || locks.current.has(id)) return;
    const generation = epoch.current;
    const isCurrent = () => epoch.current === generation && useAuthStore.getState().user?.id === userId;
    locks.current.add(id);
    setPending([...locks.current]);
    try {
      const { data, error } = await supabase.rpc('dismiss_coach_relationship_notice', { p_id: id });
      if (!isCurrent()) return;
      if (error || data?.ok !== true) throw error ?? new Error('dismiss_failed');
      setState(s => ({ ...s, rows: s.rows.filter(row => row.id !== id), failed: false }));
      setRevision(n => n + 1);
    } catch {
      if (isCurrent()) setState(s => ({ ...s, failed: true }));
    } finally {
      if (isCurrent()) {
        locks.current.delete(id);
        setPending([...locks.current]);
      }
    }
  };

  if (state.owner !== userId || (!state.rows.length && !state.failed)) return null;
  return (
    <Card className="mb-6 space-y-3">
      <h2 className="text-sm font-semibold text-white">{t('coaching.notices.title')}</h2>
      {state.rows.map(row => (
        <div key={row.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-neutral-300">
              {t('coaching.notices.ended', { name: row.client_name || t('coaching.notices.client') })}
            </p>
            <time className="text-xs text-neutral-500" dateTime={row.ended_at}>
              {new Date(row.ended_at).toLocaleDateString(i18n.language)}
            </time>
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={pending.includes(row.id)}
            onClick={() => void dismiss(row.id)}
            aria-label={t('coaching.notices.dismissFor', { name: row.client_name || t('coaching.notices.client') })}
          >
            {t('coaching.notices.dismiss')}
          </Button>
        </div>
      ))}
      {state.failed && (
        <div role="alert">
          <p className="text-sm text-amber-300">{t('coaching.notices.error')}</p>
          <Button variant="secondary" size="sm" onClick={() => setRevision(n => n + 1)}>
            {t('errors.retry')}
          </Button>
        </div>
      )}
    </Card>
  );
}
