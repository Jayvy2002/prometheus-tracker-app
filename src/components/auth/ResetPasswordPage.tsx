import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { toast } from '../ui/Toast';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { updatePassword, clearPasswordRecovery } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    toast(t('auth.passwordUpdated'));
    clearPasswordRecovery();
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">{t('auth.newPasswordTitle')}</h1>
        <p className="text-sm text-neutral-400 text-center">{t('auth.newPasswordBody')}</p>
        <Input
          type="password"
          placeholder={t('auth.password')}
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <Input
          type="password"
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          minLength={6}
          required
        />
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400">{error}</div>
        )}
        <Button type="submit" loading={loading} className="w-full">{t('auth.updatePassword')}</Button>
      </form>
    </div>
  );
}
