import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function PasswordForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    if (!currentPassword) {
      setError(t('profile.password.errors.currentRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('profile.password.errors.minLength'));
      return;
    }
    if (password !== confirm) {
      setError(t('profile.password.errors.mismatch'));
      return;
    }

    setSaving(true);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPassword,
    });

    if (signInErr) {
      setSaving(false);
      setError(t('profile.password.errors.incorrect'));
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSuccess(true);
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    }
  };

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">{t('common.back')}</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">{t('profile.password.title')}</h2>
        </>
      )}
      <div className="space-y-4">
        <Input
          label={t('profile.password.current')}
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          placeholder={t('profile.password.currentPlaceholder')}
        />
        <div className="border-t border-neutral-800/60 pt-4">
          <Input
            label={t('profile.password.new')}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('profile.password.newPlaceholder')}
          />
        </div>
        <Input
          label={t('profile.password.confirm')}
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder={t('profile.password.confirmPlaceholder')}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {success && <p className="text-sm text-blue-400">{t('profile.password.success')}</p>}
        <Button onClick={handleSave} loading={saving} className="w-full">{t('profile.password.update')}</Button>
      </div>
    </div>
  );
}
