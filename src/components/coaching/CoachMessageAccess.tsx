import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  createRelationshipAccess,
  relationshipLinkChangeNeedsRecheck,
  type RelationshipAccess,
} from '../../lib/relationshipAccess';
import Button from '../ui/Button';

/** Conversation for an active client or a coach_accepted prospect. Never grants dossier RLS. */
export default function CoachMessageAccess({ children }: { children: ReactNode }) {
  const { clientId } = useParams();
  const owner = useAuthStore(s => s.user?.id);
  const { t } = useTranslation();
  const scope = owner && clientId ? `${owner}:${clientId}` : null;
  const [result, setResult] = useState<{ scope: string; state: RelationshipAccess } | null>(null);
  const [retry, setRetry] = useState(0);
  const state = scope && result?.scope === scope ? result.state : 'checking';

  useEffect(() => {
    if (!scope || !owner || !clientId) return;
    const access = createRelationshipAccess(async () => {
      const [link, request] = await Promise.all([
        supabase.from('coach_client_links').select('id').eq('coach_id', owner).eq('client_id', clientId).eq('status', 'active').maybeSingle(),
        supabase.from('coach_join_requests').select('id').eq('coach_id', owner).eq('client_id', clientId).eq('status', 'coach_accepted').maybeSingle(),
      ]);
      if (link.error) throw link.error;
      if (request.error) throw request.error;
      return !!(link.data || request.data);
    }, next => setResult({ scope, state: next }));
    void access.check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void access.check(false);
    };
    const onOnline = () => { void access.check(false); };
    const onOffline = () => access.invalidate('unavailable');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const channel = supabase.channel(`message-access:${scope}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coach_client_links', filter: `client_id=eq.${clientId}` },
        payload => {
          if (!relationshipLinkChangeNeedsRecheck(payload)) return;
          void access.check(false);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coach_join_requests', filter: `client_id=eq.${clientId}` },
        () => { void access.check(false); },
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void access.check(false);
      });
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
  }, [scope, owner, clientId, retry]);

  if (state === 'allowed') return <div key={scope}>{children}</div>;
  return (
    <div className="p-6 space-y-4" data-testid="message-access">
      <p role={state === 'checking' ? 'status' : 'alert'}>{t(state === 'unavailable' ? 'relationshipAccess.unavailable' : 'coaching.messages.threadUnavailable')}</p>
      {state === 'unavailable' && (
        <Button onClick={() => setRetry(n => n + 1)}>{t('errors.retry')}</Button>
      )}
      <Link className="inline-flex min-h-11 items-center text-blue-400 underline" to="/messages">
        {t('nav.messages')}
      </Link>
    </div>
  );
}
