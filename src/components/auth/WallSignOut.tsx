import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';

/** Logout on the intake / onboarding walls — those screens have no Profile page. */
export default function WallSignOut() {
  const { t } = useTranslation();
  const signOut = useAuthStore(s => s.signOut);
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-sm text-neutral-500 [@media(hover:hover)]:hover:text-white"
    >
      {t('auth.signOut')}
    </button>
  );
}
