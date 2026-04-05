import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../stores/nutritionStore';
import { FOOD_UNITS } from '../../lib/constants';
import type { NutritionLog } from '../../lib/types';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Modal from '../ui/Modal';

interface Props {
  log: NutritionLog;
  onClose: () => void;
}

export default function EditFoodModal({ log, onClose }: Props) {
  const { t } = useTranslation();
  const { updateLog } = useNutritionStore();
  const [name, setName] = useState(log.name);
  const [quantity, setQuantity] = useState(log.quantity.toString());
  const [unit, setUnit] = useState(log.unit);
  const [calories, setCalories] = useState(log.calories.toString());
  const [protein, setProtein] = useState(log.protein.toString());
  const [carbs, setCarbs] = useState(log.carbs.toString());
  const [fat, setFat] = useState(log.fat.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await updateLog(log.id, {
      name,
      quantity: +quantity,
      unit,
      calories: +calories,
      protein: +protein,
      carbs: +carbs,
      fat: +fat,
    });
    toast(t('nutrition.editModal.updated'));
    setSaving(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('nutrition.editModal.title')}>
      <div className="space-y-4">
        <Input label={t('nutrition.foodForm.foodName')} value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('nutrition.foodForm.quantity')} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
          <Select
            label={t('nutrition.foodForm.unit')}
            value={unit}
            onChange={e => setUnit(e.target.value)}
            options={FOOD_UNITS.map(u => ({ value: u, label: u }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('common.calories')} type="number" value={calories} onChange={e => setCalories(e.target.value)} />
          <Input label={`${t('common.protein')} (g)`} type="number" value={protein} onChange={e => setProtein(e.target.value)} />
          <Input label={`${t('common.carbs')} (g)`} type="number" value={carbs} onChange={e => setCarbs(e.target.value)} />
          <Input label={`${t('common.fat')} (g)`} type="number" value={fat} onChange={e => setFat(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} className="flex-1" loading={saving}>{t('common.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
