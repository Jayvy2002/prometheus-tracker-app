import { useState } from 'react';
import { Download, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { dataAudience, type TrackingShare } from '../../lib/dataControl';
import { exportPersonalData } from '../../features/account/data/exportPersonalData';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  hasCoach: boolean;
  coachName: string | null;
  tracking: TrackingShare;
}

export default function DataControlPanel({ hasCoach, coachName, tracking }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [busy, setBusy] = useState(false);
  const audience = dataAudience({ hasCoach, coachName, tracking });

  const download = async () => {
    if (busy || !user) return;
    setBusy(true);
    try {
      const payload = await exportPersonalData(user.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prometheus-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast(t('profile.dataControl.exported'));
    } catch {
      toast(t('profile.dataControl.exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const moduleLabels = audience.modules.map(mod => t(`profile.dataControl.modules.${mod}`));

  return (
    <Card className="mb-4">
      <div data-testid="data-control-panel" className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center text-ink-secondary shrink-0">
            <Shield size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{t('profile.dataControl.title')}</p>
            <p className="text-xs text-ink-muted mt-1" data-testid="data-audience" data-ux67="inline-hint">
              {audience.photos === 'self'
                ? t('profile.dataControl.photosSelf')
                : t('profile.dataControl.photosCoach', { name: audience.coachName ?? t('coaching.invite.aCoach') })}
            </p>
            {audience.photos === 'coach' && (
              <p className="text-xs text-ink-muted mt-1">
                {moduleLabels.length
                  ? t('profile.dataControl.sharedModules', { modules: moduleLabels.join(', ') })
                  : t('profile.dataControl.noModules')}
              </p>
            )}
            {audience.photos === 'self' && (
              <p className="text-xs text-ink-muted mt-1">{t('profile.dataControl.noCoach')}</p>
            )}
            {hasCoach && (
              <p className="text-xs text-ink-muted mt-1">{t('profile.dataControl.linkHint')}</p>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void download()}
          loading={busy}
          data-testid="data-export"
        >
          <Download size={14} /> {t('profile.dataControl.export')}
        </Button>
        <p className="text-[11px] text-ink-muted">{t('profile.dataControl.exportHint')}</p>
      </div>
    </Card>
  );
}
