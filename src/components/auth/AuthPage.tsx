import { useRef, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Users, User, Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  authDoorCanRegister,
  credentialsFromLoginForm,
  clientLoginErrorCopy,
  postLoginPath,
  type AuthDoor,
} from '../../lib/clientAuth';
import { useAuthStore } from '../../stores/authStore';
import { clearIntendedCoachingRole, setIntendedCoachingRole } from '../../stores/coachingStore';

interface Props {
  inviteCoachName?: string | null;
  fromInvite?: boolean;
}

export default function AuthPage({ inviteCoachName, fromInvite = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<'role' | 'form'>(fromInvite ? 'form' : 'role');
  const [role, setRole] = useState<AuthDoor | null>(fromInvite ? 'client' : null);
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

  const canRegister = authDoorCanRegister(role, fromInvite);

  const chooseRole = (next: AuthDoor) => {
    setRole(next);
    setStep('form');
    setMode('login');
    setError('');
    setCheckEmail(false);
    setResetSent(false);
  };

  const backToRoles = () => {
    if (fromInvite) return;
    setStep('role');
    setMode('login');
    setError('');
    setCheckEmail(false);
    setResetSent(false);
  };

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
      if (mode === 'register' && !canRegister) {
        setError(t('auth.clientNeedsInvite'));
        return;
      }
      // Only the coach door persists a role claim. Solo = coaching_role 'none'
      // (nothing to claim). Coached clients are linked via /invite/:token
      // (accept_coach_invite), never from this form.
      if (!fromInvite && role === 'coach') {
        setIntendedCoachingRole('coach');
      } else {
        clearIntendedCoachingRole();
      }
      const result = mode === 'login' || !canRegister
        ? await signIn(nextEmail, nextPassword)
        : await signUp(nextEmail, nextPassword);
      if (result.error) {
        setError(clientLoginErrorCopy(result.error, t));
        return;
      }
      if ('needsConfirmation' in result && result.needsConfirmation) {
        setCheckEmail(true);
      } else {
        navigate(postLoginPath(), { replace: true });
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
            <img src="/logo.svg" alt="Prometheus Fitness" className="w-16 h-16 mx-auto mb-4" />
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
                className="w-full text-left bg-neutral-900 border border-neutral-800 [@media(hover:hover)]:hover:border-blue-500/40 rounded-2xl p-4 transition-colors touch-manipulation"
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
                className="w-full text-left bg-neutral-900 border border-neutral-800 [@media(hover:hover)]:hover:border-blue-500/40 rounded-2xl p-4 transition-colors touch-manipulation"
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

              <button
                type="button"
                onClick={() => chooseRole('solo')}
                className="w-full text-left bg-neutral-900 border border-neutral-800 [@media(hover:hover)]:hover:border-blue-500/40 rounded-2xl p-4 transition-colors touch-manipulation"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0">
                    <Dumbbell size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{t('auth.soloEntry')}</p>
                    <p className="text-sm text-neutral-500 mt-0.5">{t('auth.soloEntryHint')}</p>
                  </div>
                  <ArrowRight size={18} className="text-neutral-600 shrink-0" />
                </div>
              </button>
            </div>
          ) : checkEmail ? (
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
                {role === 'coach'
                  ? t('auth.signingInAsCoach')
                  : role === 'solo'
                    ? t('auth.signingInAsSolo')
                    : t('auth.signingInAsClient')}
              </p>

              {!canRegister && mode !== 'forgot' && (
                <div className="mb-4">
                  <p className="text-sm text-neutral-500">
                    {t('auth.clientNeedsInvite')}
                  </p>
                  <button
                    type="button"
                    onClick={() => chooseRole('solo')}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    {t('auth.goSolo')}
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                  <Input
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

                {mode !== 'forgot' && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
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
                    className="text-sm text-neutral-400 hover:text-blue-400 transition-colors"
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
