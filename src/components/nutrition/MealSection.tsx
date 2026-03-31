import { useState } from 'react';
import { Plus, Trash2, Sunrise, Sun, Moon, Cookie, Pencil } from 'lucide-react';
import type { NutritionLog } from '../../lib/types';
import { useNutritionStore } from '../../stores/nutritionStore';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const iconMap: Record<string, React.ElementType> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

interface Props {
  category: string;
  label: string;
  logs: NutritionLog[];
  onAdd: () => void;
  onEdit: (log: NutritionLog) => void;
}

export default function MealSection({ category, label, logs, onAdd, onEdit }: Props) {
  const { deleteLog } = useNutritionStore();
  const Icon = iconMap[category] || Cookie;
  const totalCals = logs.reduce((s, l) => s + l.calories, 0);
  const [deleteTarget, setDeleteTarget] = useState<NutritionLog | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteLog(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="bg-neutral-900/40 border border-neutral-800/30 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={16} className="text-neutral-400" />
        <span className="text-sm font-medium text-white flex-1">{label}</span>
        <span className="text-xs text-neutral-500">{Math.round(totalCals)} cal</span>
        <button
          onClick={onAdd}
          className="p-1 rounded-lg text-blue-400 hover:bg-blue-600/20 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {logs.length > 0 && (
        <div className="border-t border-neutral-800/30">
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800/20 last:border-0 animate-fade-in">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-300 truncate">{log.name}</p>
                <p className="text-[10px] text-neutral-500">{log.quantity}{log.unit}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">{Math.round(log.calories)} cal</p>
                <p className="text-[10px] text-neutral-500">
                  P:{Math.round(log.protein)}  C:{Math.round(log.carbs)}  F:{Math.round(log.fat)}
                </p>
              </div>
              <button onClick={() => onEdit(log)} className="p-1 text-neutral-600 hover:text-blue-400 transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={() => setDeleteTarget(log)} className="p-1 text-neutral-600 hover:text-rose-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Food">
        <p className="text-neutral-300 mb-6">
          Are you sure you want to delete <span className="font-semibold text-white">{deleteTarget?.name || 'this food'}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleDelete} className="flex-1 !bg-red-600 hover:!bg-red-700">
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
