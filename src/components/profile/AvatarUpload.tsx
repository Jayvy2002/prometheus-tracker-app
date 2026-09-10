import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { toast } from '../ui/Toast';

export default function AvatarUpload() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile, uploadAvatar, uploadingAvatar } = useProfileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const avatarSrc = previewUrl || (profile?.avatar_url || null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    // Q02 : mêmes règles que le bucket (5 Mo, JPEG/PNG/WebP), message utile.
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) {
      toast(t('profile.avatar.heicUnsupported'), 'error');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      toast(t('profile.avatar.unsupportedType'), 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(t('profile.avatar.tooLarge'), 'error');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    const url = await uploadAvatar(user.id, file);
    URL.revokeObjectURL(localUrl);
    setPreviewUrl(null);
    if (!url) toast(t('profile.avatar.uploadFailed'), 'error');
  };

  return (
    <div className="relative group">
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadingAvatar}
        className="relative w-20 h-20 rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black transition-all"
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-2xl font-bold">
            {initials}
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploadingAvatar ? (
            <Loader2 size={20} className="text-white animate-spin" />
          ) : (
            <Camera size={20} className="text-white" />
          )}
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <p className="text-[10px] text-neutral-600 mt-1.5 text-center max-w-[10rem]">{t('profile.avatar.publicHint')}</p>
    </div>
  );
}
