import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { todayStr } from '../../lib/utils';
import type { ProgressPhoto, ProgressPhotoKind } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const KINDS: ProgressPhotoKind[] = ['front', 'side', 'back'];

export default function ClientPhotosPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const progressPhotosEpoch = useCoachingStore(s => s.progressPhotosEpoch);
  const {
    fetchProgressPhotos, uploadProgressPhoto, deleteProgressPhoto, signProgressPhotoUrls,
  } = useCoachingStore();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<ProgressPhotoKind>('front');
  const [takenAt, setTakenAt] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async (uid: string) => {
    const rows = await fetchProgressPhotos(uid);
    setPhotos(rows);
    setUrls(await signProgressPhotoUrls(rows));
  };

  useEffect(() => {
    if (!user) return;
    void reload(user.id);
  }, [user, progressPhotosEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    const result = await uploadProgressPhoto({ file, takenAt, kind, notes });
    setUploading(false);
    if ('error' in result) {
      toast(result.error, 'error');
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
        <p className="text-sm text-neutral-500 mb-4">{t('coaching.photos.subtitle')}</p>

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
          <input
            type="date"
            value={takenAt}
            onChange={e => setTakenAt(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('coaching.photos.notesPlaceholder')}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
          <Button onClick={() => inputRef.current?.click()} loading={uploading} className="w-full">
            <Camera size={16} /> {t('coaching.photos.upload')}
          </Button>
        </Card>

        {photos.length === 0 ? (
          <Card className="text-sm text-neutral-500 text-center py-8">{t('coaching.photos.empty')}</Card>
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
                    <p className="text-[11px] text-white truncate">{t(`coaching.photos.kinds.${photo.kind}`)}</p>
                    <p className="text-[10px] text-neutral-500">{photo.taken_at}</p>
                  </div>
                  <button type="button" onClick={() => onDelete(photo)} className="p-1 text-neutral-500 hover:text-rose-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
