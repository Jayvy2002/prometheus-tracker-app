import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import {
  createProvisionalDossier,
  deleteProvisionalDossier,
  inviteProvisionalDossier,
  listProvisionalDossiers,
  provisionalErrorI18nKey,
  revokeProvisionalDossier,
  revokeProvisionalInvite,
  type ProvisionalDossier,
} from '../../features/provisional/api/provisionalApi';

type IssuedLink = { dossierId: string; url: string };
type PendingAction = { id: string; kind: 'delete' | 'revoke' };

export default function CoachDossiersPage() {
  const { t, i18n } = useTranslation();
  const { canPrepareProvisionalDossier } = useResourcePermissions();
  const [rows, setRows] = useState<ProvisionalDossier[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!canPrepareProvisionalDossier) return;
    let live = true;
    if (firstLoad.current) setLoading(true);
    setError(null);
    listProvisionalDossiers().then((result) => {
      if (!live) return;
      firstLoad.current = false;
      setLoading(false);
      if (result.error) {
        setError(provisionalErrorI18nKey(result.error));
        return;
      }
      setRows(result.data);
      setHasMore(result.data.length >= 50);
    }).catch(() => {
      if (live) {
        firstLoad.current = false;
        setLoading(false);
        setError('coaching.provisional.errors.generic');
      }
    });
    return () => { live = false; };
  }, [canPrepareProvisionalDossier, retry]);

  if (!canPrepareProvisionalDossier) return <Navigate to="/dashboard" replace />;

  const refresh = () => setRetry((value) => value + 1);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last || busy) return;
    setBusy(true);
    const result = await listProvisionalDossiers({ before: last.created_at, beforeId: last.id });
    setBusy(false);
    if (result.error) {
      setError(provisionalErrorI18nKey(result.error));
      return;
    }
    setRows((current) => [...current, ...result.data.filter((row) => !current.some((item) => item.id === row.id))]);
    setHasMore(result.data.length >= 50);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createProvisionalDossier(name.trim());
    setBusy(false);
    if (result.error || !result.data) {
      setError(provisionalErrorI18nKey(result.error));
      return;
    }
    const created = result.data;
    setName('');
    setRows((current) => [created, ...current.filter((row) => row.id !== created.id)]);
  };

  const invite = async (dossierId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    const dossier = rows.find((row) => row.id === dossierId);
    const email = emails[dossierId] ?? dossier?.invite_email ?? '';
    const result = await inviteProvisionalDossier(dossierId, email);
    setBusy(false);
    if (result.error || !result.token) {
      setError(provisionalErrorI18nKey(result.error));
      return;
    }
    setIssued({ dossierId, url: `${window.location.origin}/dossier/${result.token}` });
    refresh();
  };

  const runAction = async (dossier: ProvisionalDossier, kind: 'delete' | 'revoke' | 'revoke-invite') => {
    if (busy) return;
    if ((kind === 'delete' || kind === 'revoke') && (pending?.id !== dossier.id || pending.kind !== kind)) {
      setPending({ id: dossier.id, kind });
      return;
    }
    setBusy(true);
    setError(null);
    const result = kind === 'delete'
      ? await deleteProvisionalDossier(dossier.id)
      : kind === 'revoke'
        ? await revokeProvisionalDossier(dossier.id)
        : await revokeProvisionalInvite(dossier.id);
    setBusy(false);
    setPending(null);
    if (result.error) {
      setError(provisionalErrorI18nKey(result.error));
      return;
    }
    if (issued?.dossierId === dossier.id) setIssued(null);
    refresh();
  };

  const copyLink = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(i18n.language === 'en' ? 'en' : 'fr');
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-white mb-1">{t('coaching.provisional.title')}</h1>
        <p className="text-sm text-neutral-500 mb-6">{t('coaching.provisional.subtitle')}</p>

        <form
          className="mb-6 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label htmlFor="dossier-name" className="text-xs font-medium text-neutral-400">
            {t('coaching.provisional.createLabel')}
          </label>
          <input
            id="dossier-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('coaching.provisional.createPlaceholder')}
            className="w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
          <Button type="submit" loading={busy} disabled={name.trim().length < 1}>
            {t('coaching.provisional.create')}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-amber-200 mb-4">{t(error)}</p>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-10" role="status" aria-label={t('coaching.provisional.loading')}>
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : error && rows.length === 0 ? (
          <Button variant="secondary" onClick={refresh}>{t('errors.retry')}</Button>
        ) : rows.length === 0 ? (
          <Card>
            <FolderOpen className="text-neutral-500 mb-2" aria-hidden />
            <p className="text-sm text-white">{t('coaching.provisional.empty')}</p>
            <p className="text-xs text-neutral-500 mt-1">{t('coaching.provisional.emptyHint')}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((dossier) => {
              const open = dossier.status === 'preparing' || dossier.status === 'invited';
              return (
                <Card key={dossier.id} className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-white">{dossier.display_name}</p>
                    <p className="text-xs text-neutral-500">{t(`coaching.provisional.statuses.${dossier.status}`)}</p>
                    <p className="text-sm text-neutral-300 mt-1">
                      {t('coaching.provisional.counts.workouts', { count: dossier.workout_count })}
                      {' · '}
                      {t('coaching.provisional.counts.weights', { count: dossier.weight_count })}
                    </p>
                    {dossier.invite_email ? (
                      <p className="text-xs text-neutral-400 mt-1">
                        {t('coaching.provisional.inviteExpires', {
                          email: dossier.invite_email,
                          date: formatDate(dossier.invite_expires_at),
                        })}
                      </p>
                    ) : null}
                  </div>

                  {dossier.status === 'attached' ? (
                    <p className="text-sm text-neutral-400">{t('coaching.provisional.attached')}</p>
                  ) : null}
                  {dossier.status === 'revoked' ? (
                    <p className="text-sm text-neutral-400">{t('coaching.provisional.revoked')}</p>
                  ) : null}

                  {issued?.dossierId === dossier.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-200">{t('coaching.provisional.inviteOnce')}</p>
                      <input
                        readOnly
                        value={issued.url}
                        aria-label={t('coaching.provisional.inviteOnce')}
                        className="w-full min-h-11 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200"
                      />
                      <Button type="button" variant="secondary" onClick={() => void copyLink()}>
                        {copied ? t('coaching.provisional.copied') : t('coaching.provisional.copy')}
                      </Button>
                    </div>
                  ) : null}

                  {open ? (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void invite(dossier.id);
                      }}
                    >
                      <label htmlFor={`email-${dossier.id}`} className="text-xs text-neutral-400">
                        {t('coaching.provisional.inviteLabel')}
                      </label>
                      <input
                        id={`email-${dossier.id}`}
                        type="email"
                        autoComplete="off"
                        value={emails[dossier.id] ?? dossier.invite_email ?? ''}
                        onChange={(event) => setEmails((current) => ({ ...current, [dossier.id]: event.target.value }))}
                        className="w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" loading={busy}>
                          {t('coaching.provisional.invite')}
                        </Button>
                        <Link
                          to={`/coach/import?dossier=${dossier.id}`}
                          className="inline-flex items-center justify-center min-h-11 px-4 text-sm font-medium rounded-xl bg-surface-hover text-ink-secondary border border-line"
                        >
                          {t('coaching.provisional.import')}
                        </Link>
                      </div>
                    </form>
                  ) : null}

                  {open || dossier.status === 'revoked' ? (
                    <div className="flex flex-wrap gap-2">
                      {dossier.status === 'invited' ? (
                        <Button type="button" variant="secondary" onClick={() => void runAction(dossier, 'revoke-invite')} loading={busy}>
                          {t('coaching.provisional.revokeInvite')}
                        </Button>
                      ) : null}
                      {open ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void runAction(dossier, 'revoke')}
                          loading={busy}
                        >
                          {pending?.id === dossier.id && pending.kind === 'revoke'
                            ? t('coaching.provisional.confirmRevoke')
                            : t('coaching.provisional.revokeDossier')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => void runAction(dossier, 'delete')}
                        loading={busy}
                      >
                        {pending?.id === dossier.id && pending.kind === 'delete'
                          ? t('coaching.provisional.confirmDelete')
                          : t('common.delete')}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
        {hasMore ? (
          <Button variant="secondary" onClick={() => void loadMore()} loading={busy}>{t('coaching.importCsv.more')}</Button>
        ) : null}
      </div>
    </PageTransition>
  );
}
