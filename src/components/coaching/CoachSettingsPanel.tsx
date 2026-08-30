import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { DEFAULT_COACH_VISIBLE_TABS } from '../../lib/types';
import type { CoachClientTab, CoachNudgeTemplateKey, CoachNudgeTemplateSet } from '../../lib/types';
import {
  ALL_ON_TRACKING,
  parseCoachTrackingDefaults,
  serializeTrackingVars,
  type ResolvedTrackingConfig,
} from '../../lib/clientTracking';
import TrackingVarsEditor from './TrackingVarsEditor';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

const TEMPLATE_KEYS: CoachNudgeTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup'];

function cloneTracking(src: ResolvedTrackingConfig): ResolvedTrackingConfig {
  return {
    ...src,
    training: { ...src.training },
    nutrition: { ...src.nutrition },
    checkin: { ...src.checkin },
  };
}

export default function CoachSettingsPanel() {
  const { t, i18n } = useTranslation();
  const { coachSettings, fetchCoachSettings, saveCoachSettings } = useCoachingStore();
  const [tabs, setTabs] = useState<CoachClientTab[]>([...DEFAULT_COACH_VISIBLE_TABS]);
  const [queueMode, setQueueMode] = useState(true);
  const [templates, setTemplates] = useState<CoachNudgeTemplateSet>({});
  const [defaults, setDefaults] = useState<ResolvedTrackingConfig>(cloneTracking(ALL_ON_TRACKING));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCoachSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!coachSettings) return;
    setTabs(coachSettings.visible_tabs);
    setQueueMode(coachSettings.queue_mode_default);
    setTemplates(coachSettings.nudge_templates);
    setDefaults(cloneTracking(parseCoachTrackingDefaults(coachSettings.default_tracking)));
  }, [coachSettings]);

  const loc = i18n.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';

  const toggleTab = (tab: CoachClientTab) => {
    setTabs(prev => {
      if (prev.includes(tab)) {
        if (tab === 'overview') return prev;
        const next = prev.filter(x => x !== tab);
        return next.length === 0 ? prev : next;
      }
      return [...DEFAULT_COACH_VISIBLE_TABS.filter(x => prev.includes(x) || x === tab)];
    });
  };

  const save = async () => {
    setSaving(true);
    const result = await saveCoachSettings({
      visible_tabs: tabs,
      queue_mode_default: queueMode,
      nudge_templates: templates,
      default_tracking: serializeTrackingVars(defaults),
    });
    setSaving(false);
    if (result.error) toast(result.error, 'error');
    else toast(t('coaching.settings.saved'));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">{t('coaching.settings.hint')}</p>

      <div>
        <p className="text-xs font-medium text-neutral-400 mb-2">{t('coaching.settings.tabs')}</p>
        <div className="space-y-1.5">
          {DEFAULT_COACH_VISIBLE_TABS.map(tab => (
            <label key={tab} className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={tabs.includes(tab)}
                onChange={() => toggleTab(tab)}
                className="accent-blue-500"
              />
              {t(`coaching.tabs360.${tab}`)}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={queueMode}
          onChange={e => setQueueMode(e.target.checked)}
          className="accent-blue-500"
        />
        {t('coaching.settings.queueMode')}
      </label>

      <div className="rounded-xl border border-neutral-800 p-3 space-y-2">
        <p className="text-xs font-medium text-neutral-400">{t('coaching.settings.defaultTracking')}</p>
        <p className="text-[11px] text-neutral-500">{t('coaching.settings.defaultTrackingHint')}</p>
        <TrackingVarsEditor value={defaults} onChange={setDefaults} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-neutral-400">{t('coaching.settings.templates')}</p>
        {TEMPLATE_KEYS.map(key => (
          <label key={key} className="block">
            <span className="text-[11px] text-neutral-500">{t(`coaching.queue.templateLabels.${key}`)}</span>
            <textarea
              rows={3}
              value={templates[key]?.[loc] ?? ''}
              placeholder={t(`coaching.queue.templates.${key}`, { name: '{{name}}' })}
              onChange={e => setTemplates(prev => ({
                ...prev,
                [key]: { ...prev[key], [loc]: e.target.value },
              }))}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>
        ))}
        <p className="text-[10px] text-neutral-600">{t('coaching.settings.templateHint')}</p>
      </div>

      <Button size="sm" onClick={save} loading={saving}>{t('common.save')}</Button>
    </div>
  );
}
