import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import { normalizePersonalModules, type PersonalModules } from '../../lib/clientTracking';
import PersonalModulesPicker from './PersonalModulesPicker';

/** Profile › What I follow. Hides modules from Today and the navigation, never deletes data. */
export default function PersonalModulesForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const [modules, setModules] = useState<PersonalModules>(profile?.personal_modules ?? {});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    const result = await updateProfile(user.id, { personal_modules: normalizePersonalModules(modules) });
    setSaving(false);
    if (result.error) {
      toast(userFacingError(result.error, t('errors.generic')), 'error');
      return;
    }
    toast(t('modules.saved'));
    onDone();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">{t('modules.profileHint')}</p>
      <PersonalModulesPicker value={modules} onChange={setModules} />
      <Button className="w-full" onClick={save} loading={saving}>{t('common.save')}</Button>
    </div>
  );
}
