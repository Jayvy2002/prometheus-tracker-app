import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  expandPairs,
  plateHeightPx,
  plateInventory,
  plateStyle,
  plateWidthPx,
  platesForLoad,
  sideLoad,
  standardBarKg,
  totalFromSleeve,
  type WeightUnit,
} from '../../lib/plateMath';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function PlateCalc({
  open,
  onClose,
  load,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  load: number;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const bar = standardBarKg(unit);
  const [sleeve, setSleeve] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    const { perSide } = platesForLoad(load, unit, bar);
    setSleeve(expandPairs(perSide));
  }, [open, load, unit, bar]);

  const side = sideLoad(sleeve);
  const total = totalFromSleeve(sleeve, bar);
  const leftover = platesForLoad(load, unit, bar).leftover;
  const seededEmpty = sleeve.length === 0 && load > 0 && leftover > 0;

  return (
    <Modal open={open} onClose={onClose} title={t('workout.plates.title')}>
      <p className="text-sm text-neutral-400 mb-3">{t('workout.plates.hint')}</p>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-neutral-900 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{t('workout.plates.barLabel')}</p>
          <p className="text-sm font-semibold text-white tabular-nums">{bar} {unit}</p>
        </div>
        <div className="rounded-xl bg-neutral-900 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{t('workout.plates.perSide')}</p>
          <p className="text-sm font-semibold text-white tabular-nums">{side} {unit}</p>
        </div>
        <div className="rounded-xl bg-blue-600/15 ring-1 ring-blue-500/30 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-blue-300/80">{t('workout.plates.total')}</p>
          <p className="text-sm font-semibold text-blue-200 tabular-nums" data-plate-total="true">{total} {unit}</p>
        </div>
      </div>

      <div
        data-plate-sleeve="true"
        className="mb-4 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-5"
      >
        <div className="flex min-h-[7.5rem] items-center">
          <span className="mr-2 shrink-0 text-[10px] font-medium uppercase tracking-wider text-neutral-600 [writing-mode:vertical-rl] rotate-180">
            {t('workout.plates.barSide')}
          </span>
          <div className="h-3 w-8 shrink-0 rounded-l-full bg-gradient-to-b from-neutral-300 to-neutral-600" />
          <div className="h-8 w-2.5 shrink-0 rounded-sm bg-neutral-400 ring-1 ring-neutral-200" />
          {sleeve.length === 0 ? (
            <p className="px-4 text-xs text-neutral-500">{t('workout.plates.emptySleeve')}</p>
          ) : (
            sleeve.map((plate, index) => {
              const style = plateStyle(plate, unit);
              return (
                <button
                  key={`${plate}-${index}`}
                  type="button"
                  data-plate={plate}
                  aria-label={t('workout.plates.removeOne', { plate, unit })}
                  onClick={() => setSleeve(current => current.filter((_, i) => i !== index))}
                  className={`mx-px flex shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold ring-1 ${style.bg} ${style.text} ${style.ring}`}
                  style={{ height: plateHeightPx(plate, unit), width: plateWidthPx(plate, unit) }}
                >
                  <span className="-rotate-90 whitespace-nowrap">{plate}</span>
                </button>
              );
            })
          )}
          <div className="h-2.5 w-10 shrink-0 rounded-r-full bg-gradient-to-b from-neutral-300 to-neutral-600" />
        </div>
      </div>

      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {t('workout.plates.add')}
      </p>
      <div data-plate-palette="true" className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {plateInventory(unit).map(plate => {
          const style = plateStyle(plate, unit);
          return (
            <button
              key={plate}
              type="button"
              data-plate-add={plate}
              onClick={() => setSleeve(current => [...current, plate])}
              className={`min-h-11 rounded-xl px-1 text-xs font-bold ring-1 ${style.bg} ${style.text} ${style.ring}`}
            >
              {plate}
            </button>
          );
        })}
      </div>

      {seededEmpty && leftover > 0 && (
        <p className="text-xs text-amber-400 mb-3">{t('workout.plates.leftover', { leftover, unit })}</p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={() => setSleeve([])}>
          {t('workout.plates.clear')}
        </Button>
        <Button type="button" className="flex-1" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </Modal>
  );
}
