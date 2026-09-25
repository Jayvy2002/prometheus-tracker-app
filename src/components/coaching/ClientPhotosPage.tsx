import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { todayStr } from '../../lib/utils';
import type { ProgressPhoto, ProgressPhotoKind } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import DateField from '../ui/DateField';
import PageTransition from '../ui/PageTransition';
import ProgressPhotoCompare from './ProgressPhotoCompare';
import EmptyState from '../ui/EmptyState';
import OverflowMenu from '../ui/OverflowMenu';
import { formatDate } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { athletePhotoAudience, athletePhotoSubtitleKey } from '../../lib/photoAudience';
import { fetchMyPhotoSharing, setMyPhotoSharing, type PhotoSharingState } from '../../features/coaching/data/photoSharing';

const KINDS: ProgressPhotoKind[] = ['front', 'side', 'back'];

export default function ClientPhotosPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const progressPhotosEpoch = useCoachingStore(s => s.progressPhotosEpoch);
  const myCoach = useCoachingStore(s => s.myCoach);
  const {
    fetchProgressPhotos, uploadProgressPhoto, deleteProgressPhoto, signProgressPhotoUrls, fetchMyCoach,
  } = useCoachingStore();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<ProgressPhotoKind>('front');
  const [takenAt, setTakenAt] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sharing, setSharing] = useState<PhotoSharingState | null>(null);
  const [savingShare, setSavingShare] = useState(false);
  const coachName = myCoach?.full_name?.trim() || t('coaching.invite.aCoach');

  // Private by default (Vision §14.4): the athlete decides what the coach sees.
  useEffect(() => {
    if (!user || !myCoach) { setSharing(null); return; }
    let cancelled = false;
    void fetchMyPhotoSharing(user.id).then(state => { if (!cancelled) setSharing(state); });
    return () => { cancelled = true; };
  }, [user, myCoach]);

  const toggleShare = async () => {
    if (!sharing || sharing.status !== 'ready' || savingShare) return;
    setSavingShare(true);
    const result = await setMyPhotoSharing(!sharing.shared);
    setSavingShare(false);
    if ('error' in result) {
      toast(t('coaching.photos.shareFailed'), 'error');
      return;
    }
    setSharing({ status: 'ready', shared: result.shared });
    toast(t('coaching.photos.shareSaved'));
  };

  const reload = async (uid: string) => {
    const rows = await fetchProgressPhotos(uid);
    setPhotos(rows);
    setUrls(await signProgressPhotoUrls(rows));
  };

  useEffect(() => {
    void fetchMyCoach();
  }, [fetchMyCoach]);

  useEffect(() => {
    if (!user) return;
    void reload(user.id);
  }, [user, progressPhotosEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Q02 : les URLs signées expirent après 1 h — renouvelées au retour
  // et toutes les 30 min pour un écran laissé ouvert.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      void (async () => {
        const rows = await fetchProgressPhotos(user.id);
        setPhotos(rows);
        setUrls(await signProgressPhotoUrls(rows));
      })();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 30 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    const result = await uploadProgressPhoto({ file, takenAt, kind, notes });
    setUploading(false);
    if ('error' in result) {
      const code = result.error;
      toast(
        code === 'too_large' ? t('coaching.photos.tooLarge')
        : code === 'heic_unsupported' ? t('coaching.photos.heicUnsupported')
        : code === 'unsupported_type' ? t('coaching.photos.unsupportedType')
        : code,
        'error',
      );
      return;
    }
    setNotes('');
    toast(t('coaching.photos.uploaded'));
    await reload(user.id);
  };

  const onDelete = async (photo: ProgressPhoto) => {
    const result = await deleteProgressPhoto(photo.id, photo.storage_path);
    if (result.error) {
      toast(result.error, 'error');
      return;
    }
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <h1 className="text-2xl font-bold text-white mb-1">{t('coaching.photos.title')}</h1>
        <p className="text-sm text-neutral-500 mb-4" data-testid="ux67-inline-hint">
          {t(athletePhotoSubtitleKey(athletePhotoAudience(!!myCoach)), { name: coachName })}
        </p>

        {myCoach && sharing && (
          <div data-testid="photo-sharing"><Card className="mb-4">
            {sharing.status === 'error' ? (
              <p className="text-sm text-neutral-400" role="alert">{t('coaching.photos.shareLoadFailed')}</p>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={sharing.shared}
                disabled={savingShare}
                onClick={() => void toggleShare()}
                className="flex w-full min-h-11 items-center justify-between gap-3 text-left disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{t('coaching.photos.shareTitle', { name: coachName })}</span>
                  <span className="block text-xs text-neutral-500">
                    {t(sharing.shared ? 'coaching.photos.shareOn' : 'coaching.photos.shareOff', { name: coachName })}
                  </span>
                </span>
                <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sharing.shared ? 'bg-blue-600' : 'bg-neutral-700'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${sharing.shared ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
              </button>
            )}
          </Card></div>
        )}

        <Card className="space-y-3 mb-4">
          <div className="flex gap-1">
            {KINDS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-2.5 py-1 rounded-lg text-[11px] ${kind === k ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400'}`}
              >
                {t(`coaching.photos.kinds.${k}`)}
              </button>
            ))}
          </div>
          <DateField
            label={t('coaching.photos.dateLabel')}
            value={takenAt}
            onChange={setTakenAt}
          />
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('coaching.photos.notesPlaceholder')}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" onChange={onFile} />
          <Button onClick={() => inputRef.current?.click()} loading={uploading} className="w-full">
            <Camera size={16} /> {t('coaching.photos.upload')}
          </Button>
        </Card>

        {photos.length >= 2 && (
          <div className="mb-4">
            <ProgressPhotoCompare photos={photos} urls={urls} />
          </div>
        )}

        {KINDS.map(k => {
          const group = photos.filter(p => p.kind === k).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
          if (group.length === 0) return null;
          const first = group[0];
          const last = group[group.length - 1];
          return (
            <Card key={k} className="mb-3">
              <p className="text-sm font-medium text-white">{t(`coaching.photos.kinds.${k}`)}</p>
              <p className="text-sm text-neutral-500 mt-1">
                {t('coaching.photos.firstDate', { date: formatDate(first.taken_at) })}
                {' · '}
                {t('coaching.photos.lastDate', { date: formatDate(last.taken_at) })}
              </p>
            </Card>
          );
        })}

        {photos.length === 0 ? (
          <EmptyState title={t('coaching.photos.empty')} body={t('coaching.photos.emptyBody')} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map(photo => (
              <Card key={photo.id} padding={false} className="overflow-hidden">
                <div className="aspect-[3/4] bg-neutral-950">
                  {urls[photo.id] ? (
                    <img src={urls[photo.id]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">…</div>
                  )}
                </div>
                <div className="p-2 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{t(`coaching.photos.kinds.${photo.kind}`)}</p>
                    <p className="text-xs text-neutral-500">{formatDate(photo.taken_at)}</p>
                  </div>
                  <OverflowMenu
                    label={t('common.manage')}
                    actions={[{ id: 'delete', label: t('common.delete'), danger: true, onSelect: () => { void onDelete(photo); } }]}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
