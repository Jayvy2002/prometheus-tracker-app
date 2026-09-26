import { useRef, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  authDoorCanRegister,
  credentialsFromLoginForm,
  clientLoginErrorCopy,
  postLoginPath,
} from '../../lib/clientAuth';
import { useAuthStore } from '../../stores/authStore';
import { clearIntendedCoachingRole } from '../../stores/coachingStore';
import { track } from '../../lib/telemetryClient';

interface Props {
  inviteCoachName?: string | null;
  fromInvite?: boolean;
  returnHere?: boolean;
  banner?: string | null;
}

export default function AuthPage({ inviteCoachName, fromInvite = false, returnHere = false, banner = null }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const submittingRef = useRef(false);
  const { signIn, signUp, resetPasswordForEmail } = useAuthStore();

  const canRegister = authDoorCanRegister(null, fromInvite);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const formData = new FormData(e.currentTarget);
    const { email: nextEmail, password: nextPassword } = credentialsFromLoginForm({
      formEmail: String(formData.get('email') ?? ''),
      formPassword: String(formData.get('password') ?? ''),
      stateEmail: email,
      statePassword: password,
    });
    setEmail(nextEmail);
    if (mode !== 'forgot') setPassword(nextPassword);
    setError('');
    submittingRef.current = true;
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const result = await resetPasswordForEmail(nextEmail);
        if (result.error) {
          setError(clientLoginErrorCopy(result.error, t));
          return;
        }
        setResetSent(true);
        return;
      }
      // Signing in never grants professional capability or accepts a coaching link.
      clearIntendedCoachingRole();
      const result = mode === 'login' || !canRegister
        ? await signIn(nextEmail, nextPassword)
        : await signUp(nextEmail, nextPassword);
      if (result.error) {
        setError(clientLoginErrorCopy(result.error, t));
        return;
      }
      if (mode === 'register') {
        track('account_created', { door: fromInvite ? 'invite' : 'intention_pending', from_invite: fromInvite });
      }
      if ('needsConfirmation' in result && result.needsConfirmation) {
        setCheckEmail(true);
      } else {
        navigate((fromInvite || returnHere) ? postLoginPath(location.pathname) : postLoginPath(), { replace: true });
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10 animate-fade-in-scale">
            <img src="/logo.svg" alt="Prometheus Fitness" className="logo-mark w-16 h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white tracking-tight">Prometheus</h1>
            <p className="text-neutral-400 mt-2">{t('auth.tagline')}</p>
          </div>

          {(fromInvite || banner) && (
            <div className="mb-5 bg-blue-600/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-200 text-center">
              {banner ?? (inviteCoachName
                ? t('coaching.invite.authBanner', { name: inviteCoachName })
                : t('coaching.invite.authBannerNoName'))}
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
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-neutral-300 mb-1.5">
                    {t('auth.emailAddress')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                    <Input
                      id="auth-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder={t('auth.emailAddress')}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-11"
                      required
                    />
                  </div>
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label htmlFor="auth-password" className="block text-sm font-medium text-neutral-300 mb-1.5">
                      {t('auth.password')}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                      <Input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        placeholder={t('auth.password')}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="pl-11 pr-12"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-neutral-500 hover:text-neutral-300"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
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

                <Button type="submit" loading={loading} pressOnly className="w-full" size="lg">
                  {mode === 'login' ? t('auth.signIn') : mode === 'register' ? t('auth.createAccount') : t('auth.sendReset')}
                  <ArrowRight size={18} />
                </Button>
              </form>

              {canRegister ? (
                <div className="mt-6 text-center animate-fade-in stagger-4">
                  <button
                    type="button"
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
              ) : mode === 'forgot' ? (
                <div className="mt-6 text-center animate-fade-in stagger-4">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
                    className="text-sm text-neutral-400 hover:text-blue-400"
                  >
                    {t('auth.backToSignIn')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
