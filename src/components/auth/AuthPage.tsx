import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  inviteCoachName?: string | null;
}

export default function AuthPage({ inviteCoachName }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { signIn, signUp, resetPasswordForEmail } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'forgot') {
      const result = await resetPasswordForEmail(email);
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setResetSent(true);
      return;
    }
    const result = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if ('needsConfirmation' in result && result.needsConfirmation) {
      setCheckEmail(true);
    }
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

          {checkEmail ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-center">
              <p className="text-white font-medium mb-2">{t('auth.checkInboxTitle')}</p>
              <p className="text-sm text-neutral-400">{t('auth.checkInboxBody', { email })}</p>
              <button
                onClick={() => { setCheckEmail(false); setMode('login'); }}
                className="mt-4 text-sm text-blue-400"
              >
                {t('auth.backToSignIn')}
              </button>
            </div>
          ) : resetSent ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-center">
              <p className="text-white font-medium mb-2">{t('auth.resetSentTitle')}</p>
              <p className="text-sm text-neutral-400">{t('auth.resetSentBody', { email })}</p>
              <button
                onClick={() => { setResetSent(false); setMode('login'); }}
                className="mt-4 text-sm text-blue-400"
              >
                {t('auth.backToSignIn')}
              </button>
            </div>
          ) : (
            <>
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

                {mode !== 'forgot' && (
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
                )}

                {mode === 'login' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className="text-xs text-neutral-500 hover:text-blue-400"
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  {mode === 'login' ? t('auth.signIn') : mode === 'register' ? t('auth.createAccount') : t('auth.sendReset')}
                  <ArrowRight size={18} />
                </Button>
              </form>

              <div className="mt-6 text-center animate-fade-in stagger-4">
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                    setResetSent(false);
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
