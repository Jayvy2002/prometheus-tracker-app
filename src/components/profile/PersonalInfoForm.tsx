import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function PersonalInfoForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [gender, setGender] = useState(profile?.gender ?? 'male');
  const [dob, setDob] = useState(profile?.date_of_birth ?? '');
  const [height, setHeight] = useState(profile?.height_cm?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await updateProfile(user.id, {
      full_name: name,
      gender,
      date_of_birth: dob || null,
      height_cm: +height,
    });
    setSaving(false);
    onBack();
  };

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">Back</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">Personal Information</h2>
        </>
      )}
      <div className="space-y-4">
        <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">Gender</label>
          <div className="grid grid-cols-3 gap-2">
            {['male', 'female', 'other'].map(g => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`py-2.5 rounded-xl text-sm capitalize transition-all
                  ${gender === g ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 border border-neutral-800'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <Input label="Date of Birth" type="date" value={dob} onChange={e => setDob(e.target.value)} />
        <Input label="Height (cm)" type="number" value={height} onChange={e => setHeight(e.target.value)} />
        <Button onClick={handleSave} loading={saving} className="w-full">Save Changes</Button>
      </div>
    </div>
  );
}
