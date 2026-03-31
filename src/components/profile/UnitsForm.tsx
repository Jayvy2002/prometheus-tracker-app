import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import Button from '../ui/Button';

export default function UnitsForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const [unitWeight, setUnitWeight] = useState(profile?.unit_weight ?? 'kg');
  const [unitDistance, setUnitDistance] = useState(profile?.unit_distance ?? 'km');
  const [unitHeight, setUnitHeight] = useState(profile?.unit_height ?? 'cm');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await updateProfile(user.id, {
      unit_weight: unitWeight as 'kg' | 'lbs',
      unit_distance: unitDistance as 'km' | 'mi',
      unit_height: unitHeight as 'cm' | 'in',
    });
    setSaving(false);
    onBack();
  };

  const UnitToggle = ({ label, value, options, onChange }: {
    label: string; value: string; options: [string, string]; onChange: (v: string) => void;
  }) => (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-neutral-300">{label}</span>
      <div className="flex rounded-xl overflow-hidden border border-neutral-800">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors
              ${value === o ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">Back</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">Units & Preferences</h2>
        </>
      )}
      <div className="space-y-1 mb-6">
        <UnitToggle label="Weight" value={unitWeight} options={['kg', 'lbs']} onChange={(v) => setUnitWeight(v as 'kg' | 'lbs')} />
        <UnitToggle label="Distance" value={unitDistance} options={['km', 'mi']} onChange={(v) => setUnitDistance(v as 'km' | 'mi')} />
        <UnitToggle label="Height" value={unitHeight} options={['cm', 'in']} onChange={(v) => setUnitHeight(v as 'cm' | 'in')} />
      </div>
      <Button onClick={handleSave} loading={saving} className="w-full">Save Preferences</Button>
    </div>
  );
}
