import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Link2, Users, ChevronRight, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

export default function ClientsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, invites, loading,
    fetchMyRole, fetchClients, fetchInvites, createInvite, revokeInvite, enableCoachMode,
  } = useCoachingStore();
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyRole(user.id).then(() => {
      fetchClients();
      fetchInvites();
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

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{t('coaching.clientsTitle')}</h1>
          <Button size="sm" variant="secondary" onClick={() => navigate('/programs')}>
            {t('programs.title')}
          </Button>
        </div>

        <Card className="mb-6">
          <p className="text-sm font-medium text-white mb-3">{t('coaching.invite.generate')}</p>
          <div className="flex items-center gap-2 mb-3">
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
        </Card>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-neutral-900 animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="text-center py-10">
            <Users className="mx-auto mb-3 text-neutral-600" size={28} />
            <p className="text-neutral-400">{t('coaching.noClients')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <Card
                key={c.id}
                onClick={() => navigate(`/clients/${c.id}`)}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.full_name[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{c.full_name || c.email || t('coaching.unnamed')}</p>
                  <p className="text-xs text-neutral-500 truncate">{c.email}</p>
                </div>
                <ChevronRight size={16} className="text-neutral-600" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
