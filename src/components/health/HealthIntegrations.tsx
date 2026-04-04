import { ArrowLeft, Heart, Activity, Watch, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HEALTH_PROVIDERS } from '../../lib/constants';
import Card from '../ui/Card';
import FullPageLayout from '../layout/FullPageLayout';
import PageTransition from '../ui/PageTransition';

const iconMap: Record<string, React.ElementType> = {
  Heart, Activity, Watch,
};

export default function HealthIntegrations() {
  const navigate = useNavigate();

  return (
    <FullPageLayout>
      <PageTransition>
        <div className="px-4 pt-6 pb-24">
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors animate-fade-in-left">
            <ArrowLeft size={18} /> <span className="text-sm">Back</span>
          </button>
          <h1 className="text-2xl font-bold text-white mb-2 animate-fade-in-down">Health Integrations</h1>
          <p className="text-sm text-neutral-400 mb-6 animate-fade-in stagger-2">Connect external health services to sync your data</p>

          <div className="mb-6 bg-blue-600/10 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3 animate-fade-in-scale">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
              <Clock size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">Coming Soon</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Health integrations are currently in development. You will soon be able to sync your steps, heart rate, and activity data from Apple Health, Google Fit, and Garmin Connect.
              </p>
            </div>
          </div>

          <div className="space-y-3 opacity-50 pointer-events-none select-none">
            {HEALTH_PROVIDERS.map((provider, i) => {
              const Icon = iconMap[provider.icon] || Heart;
              return (
                <div key={provider.id} className="animate-fade-in-up" style={{ animationDelay: `${(i + 2) * 60}ms` }}>
                  <Card>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-neutral-800 text-neutral-400 flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white text-sm">{provider.name}</p>
                        <p className="text-xs text-neutral-500">Not yet available</p>
                      </div>
                      <span className="text-xs text-neutral-600 font-medium bg-neutral-800 px-2 py-1 rounded-lg">Soon</span>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </PageTransition>
    </FullPageLayout>
  );
}
