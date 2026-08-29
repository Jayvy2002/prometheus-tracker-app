import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import type { ProgressPhoto, ProgressPhotoKind } from '../../lib/types';

const KINDS: ProgressPhotoKind[] = ['front', 'side', 'back'];

export default function ProgressPhotoCompare({
  photos,
  urls,
}: {
  photos: ProgressPhoto[];
  urls: Record<string, string>;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ProgressPhotoKind>('front');
  const ofKind = useMemo(
    () => photos.filter(p => p.kind === kind).sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    [photos, kind],
  );
  const [beforeId, setBeforeId] = useState<string>('');
  const [afterId, setAfterId] = useState<string>('');

  useEffect(() => {
    if (ofKind.length === 0) {
      setBeforeId('');
      setAfterId('');
      return;
    }
    setBeforeId(ofKind[0].id);
    setAfterId(ofKind[ofKind.length - 1].id);
  }, [ofKind]);

  const before = ofKind.find(p => p.id === beforeId);
  const after = ofKind.find(p => p.id === afterId);

  if (photos.length === 0) {
    return <Card className="text-sm text-neutral-500">{t('coaching.photos.emptyCoach')}</Card>;
  }

  return (
    <Card className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{t('coaching.photos.compareTitle')}</p>
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
      {ofKind.length < 2 ? (
        <p className="text-xs text-neutral-500">{t('coaching.photos.needTwo')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-500">
              {t('coaching.photos.before')}
              <select
                value={beforeId}
                onChange={e => setBeforeId(e.target.value)}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
              >
                {ofKind.map(p => (
                  <option key={p.id} value={p.id}>{p.taken_at}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-neutral-500">
              {t('coaching.photos.after')}
              <select
                value={afterId}
                onChange={e => setAfterId(e.target.value)}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
              >
                {ofKind.map(p => (
                  <option key={p.id} value={p.id}>{p.taken_at}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[before, after].map((photo, i) => (
              <div key={photo?.id ?? i} className="rounded-xl overflow-hidden bg-neutral-950 aspect-[3/4]">
                {photo && urls[photo.id] ? (
                  <img src={urls[photo.id]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">—</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
