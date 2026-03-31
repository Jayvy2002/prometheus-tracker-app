import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function PasswordForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
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
      setError('Please enter your current password');
      return;
    }
    if (password.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPassword,
    });

    if (signInErr) {
      setSaving(false);
      setError('Current password is incorrect');
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
            <ArrowLeft size={18} /> <span className="text-sm">Back</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">Change Password</h2>
        </>
      )}
      <div className="space-y-4">
        <Input
          label="Current Password"
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          placeholder="Enter your current password"
        />
        <div className="border-t border-neutral-800/60 pt-4">
          <Input
            label="New Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>
        <Input
          label="Confirm New Password"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repeat new password"
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {success && <p className="text-sm text-blue-400">Password updated successfully</p>}
        <Button onClick={handleSave} loading={saving} className="w-full">Update Password</Button>
      </div>
    </div>
  );
}
