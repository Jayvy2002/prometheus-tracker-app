import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import Button from '../ui/Button';
import type { ProgressPhoto } from '../../lib/types';
import {
  defaultComparePair,
  photoCompareKind,
  resolveComparePair,
  sortedProgressPhotos,
} from '../../lib/coachPhotos';

export default function ProgressPhotoCompare({
  photos,
  urls,
  relanceHref,
}: {
  photos: ProgressPhoto[];
  urls: Record<string, string>;
  relanceHref?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sorted = useMemo(() => sortedProgressPhotos(photos), [photos]);
  const kind = photoCompareKind(sorted);
  const defaults = useMemo(() => defaultComparePair(sorted), [sorted]);
  const [oldestId, setOldestId] = useState(defaults.oldest?.id ?? '');
  const [newestId, setNewestId] = useState(defaults.newest?.id ?? '');

  useEffect(() => {
    setOldestId(defaults.oldest?.id ?? '');
    setNewestId(defaults.newest?.id ?? '');
  }, [defaults.oldest?.id, defaults.newest?.id]);

  const pair = resolveComparePair(sorted, oldestId, newestId);

  if (kind === 'empty') {
    return (
      <Card className="space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500">{t('coaching.photos.compareTitle')}</p>
        <p className="text-sm text-neutral-300">{t('coaching.photos.emptyCoachRelance')}</p>
        {relanceHref ? (
          <Button size="sm" onClick={() => navigate(relanceHref)}>
            {t('coaching.queue.relance')}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{t('coaching.photos.compareTitle')}</p>
      {sorted.length >= 2 && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-neutral-500">
            {t('coaching.photos.oldest')}
            <select
              value={oldestId}
              onChange={e => setOldestId(e.target.value)}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              {sorted.map(p => (
                <option key={p.id} value={p.id}>{p.taken_at} · {t(`coaching.photos.kinds.${p.kind}`)}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-neutral-500">
            {t('coaching.photos.newest')}
            <select
              value={newestId}
              onChange={e => setNewestId(e.target.value)}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              {sorted.map(p => (
                <option key={p.id} value={p.id}>{p.taken_at} · {t(`coaching.photos.kinds.${p.kind}`)}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <PhotoSlot
          label={t('coaching.photos.oldest')}
          photo={pair.oldest}
          url={pair.oldest ? urls[pair.oldest.id] : undefined}
          emptyHint={t('coaching.photos.slotEmpty')}
        />
        <PhotoSlot
          label={t('coaching.photos.newest')}
          photo={pair.newest}
          url={pair.newest ? urls[pair.newest.id] : undefined}
          emptyHint={kind === 'single' ? t('coaching.photos.needSecond') : t('coaching.photos.slotEmpty')}
        />
      </div>
      {kind === 'single' && relanceHref && (
        <Button size="sm" variant="secondary" onClick={() => navigate(relanceHref)}>
          {t('coaching.queue.relance')}
        </Button>
      )}
    </Card>
  );
}

function PhotoSlot({
  label,
  photo,
  url,
  emptyHint,
}: {
  label: string;
  photo: { id: string; taken_at: string } | null;
  url?: string;
  emptyHint: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-neutral-500 mb-1">{label}{photo ? ` · ${photo.taken_at}` : ''}</p>
      <div className="rounded-xl overflow-hidden bg-neutral-950 aspect-[3/4]">
        {photo && url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs px-3 text-center">
            {emptyHint}
          </div>
        )}
      </div>
    </div>
  );
}
