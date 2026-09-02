import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../stores/profileStore';
import { profileInitials } from '../../lib/coachChrome';

type CoachProfileButtonProps = {
  className?: string;
};

export default function CoachProfileButton({ className = '' }: CoachProfileButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useProfileStore(s => s.profile);
  const initials = profileInitials(profile?.full_name);
  const avatarUrl = profile?.avatar_url?.trim() || '';
  const active = location.pathname.startsWith('/profile');

  return (
    <button
      type="button"
      onClick={() => navigate('/profile')}
      aria-label={t('nav.profile')}
      className={`h-9 w-9 shrink-0 overflow-hidden rounded-full border border-neutral-800 bg-neutral-900
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        ${active ? 'ring-2 ring-blue-500' : ''} ${className}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-neutral-200">
          {initials}
        </span>
      )}
    </button>
  );
}
