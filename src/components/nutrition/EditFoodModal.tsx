import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../stores/nutritionStore';
import { FOOD_UNITS } from '../../lib/constants';
import { rescaleNutritionMacros } from '../../lib/foodEnergy';
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

function fieldValue(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export default function EditFoodModal({ log, onClose }: Props) {
  const { t } = useTranslation();
  const { updateLog } = useNutritionStore();
  const [name, setName] = useState(log.name);
  const [quantity, setQuantity] = useState(log.quantity.toString());
  const [unit, setUnit] = useState(log.unit);
  const [calories, setCalories] = useState(fieldValue(log.calories));
  const [protein, setProtein] = useState(fieldValue(log.protein));
  const [carbs, setCarbs] = useState(fieldValue(log.carbs));
  const [fat, setFat] = useState(fieldValue(log.fat));
  const [saving, setSaving] = useState(false);

  const applyRescale = (nextQuantity: string, nextUnit: string) => {
    const qty = +nextQuantity;
    if (!Number.isFinite(qty) || qty <= 0) return;
    const scaled = rescaleNutritionMacros(log, { quantity: qty, unit: nextUnit });
    setCalories(fieldValue(scaled.calories));
    setProtein(fieldValue(scaled.protein));
    setCarbs(fieldValue(scaled.carbs));
    setFat(fieldValue(scaled.fat));
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(value);
    applyRescale(value, unit);
  };

  const handleUnitChange = (value: string) => {
    setUnit(value);
    applyRescale(quantity, value);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const qty = +quantity;
    if (!Number.isFinite(qty) || qty <= 0) {
      toast(t('nutrition.foodForm.errors.quantityPositive'), 'error');
      return;
    }
    setSaving(true);
    await updateLog(log.id, {
      name,
      quantity: qty,
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
          <Input
            label={t('nutrition.foodForm.quantity')}
            type="number"
            value={quantity}
            onChange={e => handleQuantityChange(e.target.value)}
          />
          <Select
            label={t('nutrition.foodForm.unit')}
            value={unit}
            onChange={e => handleUnitChange(e.target.value)}
            options={FOOD_UNITS.map(u => ({ value: u, label: u }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('common.calories')} type="number" value={calories} onChange={e => setCalories(e.target.value)} />
          <Input label={`${t('common.protein')} (g)`} type="number" value={protein} onChange={e => setProtein(e.target.value)} />
          <Input label={`${t('common.carbs')} (g)`} type="number" value={carbs} onChange={e => setCarbs(e.target.value)} />
          <Input label={`${t('common.fat')} (g)`} type="number" value={fat} onChange={e => setFat(e.target.value)} />
        </div>
        <p className="text-sm text-blue-400 font-medium">
          {t('nutrition.foodForm.total')} {Math.round(+calories || 0)} cal | P: {Math.round(+protein || 0)}g | C: {Math.round(+carbs || 0)}g | F: {Math.round(+fat || 0)}g
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} className="flex-1" loading={saving}>{t('common.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
