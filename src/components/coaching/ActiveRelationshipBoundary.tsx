import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { createRelationshipAccess, type RelationshipAccess } from '../../lib/relationshipAccess';
import Button from '../ui/Button';

/** UI revocation complements RLS; it never grants server permissions. */
export default function ActiveRelationshipBoundary({ children }: { children: ReactNode }) {
  const { id, clientId } = useParams();
  const target = clientId ?? id;
  const owner = useAuthStore(s => s.user?.id);
  const { t } = useTranslation();
  const scope = owner && target ? `${owner}:${target}` : null;
  const [result, setResult] = useState<{ scope: string; state: RelationshipAccess } | null>(null);
  const [retry, setRetry] = useState(0);
  const state = scope && result?.scope === scope ? result.state : 'checking';

  useEffect(() => {
    if (!scope || !owner || !target) return;
    const access = createRelationshipAccess(async () => {
      const { data, error } = await supabase.from('coach_client_links')
        .select('id').eq('coach_id', owner).eq('client_id', target).eq('status', 'active').maybeSingle();
      if (error) throw error;
      return !!data;
    }, state => setResult({ scope, state }));
    void access.check();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') access.invalidate('checking');
      else void access.check();
    };
    const onOnline = () => { void access.check(); };
    const onOffline = () => access.invalidate('unavailable');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const channel = supabase.channel(`relationship-access:${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_client_links', filter: `client_id=eq.${target}` }, () => { void access.check(); })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void access.check(false);
      });
    // Realtime may be unavailable; active tabs still revalidate periodically.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void access.check(false);
    }, 30000);
    return () => {
      access.dispose();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      void supabase.removeChannel(channel);
    };
  }, [scope, owner, target, retry]);

  if (state === 'allowed') return <div key={scope}>{children}</div>;
  return <div className="p-6 space-y-4" data-testid="relationship-access">
    <p role={state === 'checking' ? 'status' : 'alert'}>{t(`relationshipAccess.${state}`)}</p>
    {state === 'unavailable' && <Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>}
    <Link className="inline-flex min-h-11 items-center text-blue-400 underline" to="/clients">{t('relationshipAccess.back')}</Link>
  </div>;
}
