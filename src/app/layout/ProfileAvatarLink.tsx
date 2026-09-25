import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../stores/profileStore';

/**
 * The avatar that opens Profil. Same look, same place (top-left) and same
 * accessible name wherever it appears: in the Dashboard header, and above the
 * other main pages when Profil is not a bottom tab (coached athlete).
 */
export default function ProfileAvatarLink() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const profile = useProfileStore(s => s.profile);
  const initial = profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U';
  return (
    <Link
      to="/profile"
      aria-label={t('nav.profile')}
      aria-current={pathname === '/profile' ? 'page' : undefined}
      className="block w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-neutral-800 hover:ring-[#525252] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      data-testid="profile-avatar-link"
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold" aria-hidden="true">
          {initial}
        </span>
      )}
    </Link>
  );
}
