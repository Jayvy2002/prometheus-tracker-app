import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import PrometheusWatchPanel from '../dashboard/PrometheusWatchPanel';

export default function WatchPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  if (!user) return null;
  return (
    <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">{t('prometheusWatch.title')}</h1>
      <p className="text-sm text-neutral-400 mb-4">{t('prometheusWatch.subtitle')}</p>
      <PrometheusWatchPanel athleteId={user.id} viewer="self" showHeader={false} />
    </div>
  );
}
