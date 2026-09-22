import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { DEFAULT_COACH_VISIBLE_TABS } from '../../lib/types';
import type { CoachClientTab, CoachNudgeTemplateKey, CoachNudgeTemplateSet } from '../../lib/types';
import {
  DEFAULT_COACH_TRACKING,
  parseCoachTrackingDefaults,
  serializeTrackingVars,
  type ResolvedTrackingConfig,
} from '../../lib/clientTracking';
import TrackingVarsEditor from './TrackingVarsEditor';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import { timezoneDisplayLabel } from '../../lib/timezoneLabel';

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
  const [templates, setTemplates] = useState<CoachNudgeTemplateSet>({});
  const [defaults, setDefaults] = useState<ResolvedTrackingConfig>(cloneTracking(DEFAULT_COACH_TRACKING));
  const [timezone, setTimezone] = useState('America/Toronto');
  const [cutoffHour, setCutoffHour] = useState(21);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCoachSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!coachSettings) return;
    setTabs(coachSettings.visible_tabs);
    setTemplates(coachSettings.nudge_templates);
    setDefaults(cloneTracking(parseCoachTrackingDefaults(coachSettings.default_tracking)));
    setTimezone(coachSettings.timezone);
    setCutoffHour(coachSettings.missed_workout_cutoff_hour);
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
      nudge_templates: templates,
      default_tracking: serializeTrackingVars(defaults),
      timezone,
      missed_workout_cutoff_hour: cutoffHour,
    });
    setSaving(false);
    if (result.error) toast(result.error, 'error');
    else toast(t('coaching.settings.saved'));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">{t('coaching.settings.hint')}</p>
      <Link
        to="/coach/learned"
        className="block text-sm text-blue-400 hover:text-blue-300"
      >
        {t('coaching.learned.open')}
      </Link>
      <Link
        to="/coach/import"
        className="block text-sm text-blue-400 hover:text-blue-300"
      >
        {t('coaching.importCsv.title')}
      </Link>

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

      <div className="rounded-xl border border-neutral-800 p-3 space-y-2">
        <p className="text-xs font-medium text-neutral-400">{t('coaching.settings.defaultTracking')}</p>
        <p className="text-[11px] text-neutral-500">{t('coaching.settings.defaultTrackingHint')}</p>
        <TrackingVarsEditor value={defaults} onChange={setDefaults} />
      </div>

      <div className="rounded-xl border border-neutral-800 p-3 space-y-3">
        <p className="text-xs font-medium text-neutral-400">{t('coaching.settings.alertTiming')}</p>
        <label className="block">
          <span className="text-sm text-neutral-400">{t('coaching.settings.timezone')}</span>
          <p className="text-sm text-neutral-500 mt-1">{t('coaching.settings.timezoneHint', { label: timezoneDisplayLabel(timezone, i18n.language), tz: timezone })}</p>
          <input
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            placeholder="America/Toronto"
            className="mt-1 w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-neutral-500">{t('coaching.settings.missedWorkoutCutoff')}</span>
          <input
            type="number"
            min={0}
            max={23}
            value={cutoffHour}
            onChange={e => setCutoffHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
            className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          />
        </label>
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

      <Link to="/coach/profile" className="block text-blue-400">{t('marketplace.profile')}</Link>
      <Link to="/coaching-requests" className="block text-blue-400">{t('marketplace.requests')}</Link>
      <Link to="/coach/questionnaire" className="block text-blue-400">{t('coachQuestionnaire.title')}</Link>
      <Button size="sm" onClick={save} loading={saving}>{t('common.save')}</Button>
    </div>
  );
}
