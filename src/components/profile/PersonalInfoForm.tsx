import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { toast } from '../ui/Toast';
import { optionLabel } from '../../lib/optionLabels';

export default function PersonalInfoForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { t } = useTranslation();
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
    const result = await updateProfile(user.id, {
      full_name: name,
      gender,
      date_of_birth: dob || null,
      height_cm: +height,
    });
    setSaving(false);
    if (result.error) {
      toast(result.error, 'error');
      return;
    }
    onBack();
  };

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">{t('common.back')}</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">{t('profile.personalInfo.title')}</h2>
        </>
      )}
      <div className="space-y-4">
        <Input label={t('profile.personalInfo.fullName')} value={name} onChange={e => setName(e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">{t('profile.personalInfo.gender')}</label>
          <div className="grid grid-cols-3 gap-2">
            {['male', 'female', 'other'].map(g => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`py-2.5 rounded-xl text-sm transition-all
                  ${gender === g ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 border border-neutral-800'}`}
              >
                {optionLabel(t, 'genders', g)}
              </button>
            ))}
          </div>
        </div>
        <Input label={t('profile.personalInfo.dateOfBirth')} type="date" value={dob} onChange={e => setDob(e.target.value)} />
        <Input label={t('profile.personalInfo.heightCm')} type="number" value={height} onChange={e => setHeight(e.target.value)} />
        <Button onClick={handleSave} loading={saving} className="w-full">{t('common.saveChanges')}</Button>
      </div>
    </div>
  );
}
