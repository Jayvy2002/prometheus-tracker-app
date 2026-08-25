import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Users, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuthStore } from '../../stores/authStore';
import {
  setIntendedCoachingRole,
  type IntendedCoachingRole,
} from '../../stores/coachingStore';

interface Props {
  inviteCoachName?: string | null;
  fromInvite?: boolean;
}

export default function AuthPage({ inviteCoachName, fromInvite = false }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'role' | 'form'>(fromInvite ? 'form' : 'role');
  const [role, setRole] = useState<IntendedCoachingRole | null>(fromInvite ? 'client' : null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuthStore();

  const chooseRole = (next: IntendedCoachingRole) => {
    setRole(next);
    setStep('form');
    setError('');
  };

  const backToRoles = () => {
    if (fromInvite) return;
    setStep('role');
    setMode('login');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const resolvedRole: IntendedCoachingRole = fromInvite ? 'client' : (role ?? 'client');
    setIntendedCoachingRole(resolvedRole);
    const result = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10 animate-fade-in-scale">
            <img src="/logo.svg" alt="Prometheus Tracker" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white tracking-tight">Prometheus</h1>
            <p className="text-neutral-400 mt-2">{t('auth.tagline')}</p>
          </div>

          {inviteCoachName && (
            <div className="mb-5 bg-blue-600/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-200 text-center">
              {t('coaching.invite.authBanner', { name: inviteCoachName })}
            </div>
          )}

          {step === 'role' && !fromInvite ? (
            <div className="space-y-3 animate-fade-in-up">
              <div className="text-center mb-5">
                <h2 className="text-lg font-semibold text-white">{t('auth.chooseRoleTitle')}</h2>
                <p className="text-sm text-neutral-500 mt-1">{t('auth.chooseRoleSubtitle')}</p>
              </div>

              <button
                type="button"
                onClick={() => chooseRole('coach')}
                className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center shrink-0">
                    <Users size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{t('auth.coachEntry')}</p>
                    <p className="text-sm text-neutral-500 mt-0.5">{t('auth.coachEntryHint')}</p>
                  </div>
                  <ArrowRight size={18} className="text-neutral-600 shrink-0" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => chooseRole('client')}
                className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                    <User size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{t('auth.clientEntry')}</p>
                    <p className="text-sm text-neutral-500 mt-0.5">{t('auth.clientEntryHint')}</p>
                  </div>
                  <ArrowRight size={18} className="text-neutral-600 shrink-0" />
                </div>
              </button>
            </div>
          ) : (
            <>
              {!fromInvite && (
                <button
                  type="button"
                  onClick={backToRoles}
                  className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300"
                >
                  <ArrowLeft size={16} />
                  {t('auth.backToRoles')}
                </button>
              )}

              <p className="text-xs font-medium uppercase tracking-wide text-blue-400/80 mb-3">
                {role === 'coach' ? t('auth.signingInAsCoach') : t('auth.signingInAsClient')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-2">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                  <Input
                    type="email"
                    placeholder={t('auth.emailAddress')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-11"
                    required
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.password')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-11 pr-11"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  {mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
                  <ArrowRight size={18} />
                </Button>
              </form>

              <div className="mt-6 text-center animate-fade-in stagger-4">
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                  }}
                  className="text-sm text-neutral-400 hover:text-blue-400 transition-colors"
                >
                  {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
