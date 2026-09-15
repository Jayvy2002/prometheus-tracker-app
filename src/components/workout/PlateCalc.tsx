import { useTranslation } from 'react-i18next';
import { platesForLoad, standardBarKg } from '../../lib/plateMath';
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
  unit: 'kg' | 'lbs';
}) {
  const { t } = useTranslation();
  const bar = standardBarKg(unit);
  const { perSide, leftover } = platesForLoad(load, unit, bar);
  return (
    <Modal open={open} onClose={onClose} title={t('workout.plates.title')}>
      <p className="text-sm text-neutral-300 mb-3">
        {t('workout.plates.body', { load, bar, unit })}
      </p>
      {perSide.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('workout.plates.empty')}</p>
      ) : (
        <ul className="space-y-1 text-sm text-white">
          {perSide.map(row => (
            <li key={row.plate}>{row.count} × {row.plate} {unit} {t('workout.plates.perSide')}</li>
          ))}
        </ul>
      )}
      {leftover > 0 && (
        <p className="text-xs text-amber-400 mt-2">{t('workout.plates.leftover', { leftover, unit })}</p>
      )}
      <Button type="button" className="w-full mt-4" onClick={onClose}>{t('common.close')}</Button>
    </Modal>
  );
}
