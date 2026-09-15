import { useTranslation } from 'react-i18next';
import {
  CHECKIN_CORE_VAR_KEYS,
  CHECKIN_EXTRA_VAR_KEYS,
  NUTRITION_VAR_KEYS,
  TRAINING_VAR_KEYS,
  groupAllEnabled,
  toggleGroup,
  type CheckinVarKey,
  type NutritionVarKey,
  type ResolvedTrackingConfig,
  type TrainingVarKey,
} from '../../lib/clientTracking';

interface Props {
  value: ResolvedTrackingConfig;
  onChange: (next: ResolvedTrackingConfig) => void;
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-blue-500"
      />
      {label}
    </label>
  );
}

function GroupHeader({
  title,
  allOn,
  onToggleAll,
}: {
  title: string;
  allOn: boolean;
  onToggleAll: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-1.5">
      <p className="text-xs font-medium text-neutral-400">{title}</p>
      <button
        type="button"
        onClick={() => onToggleAll(!allOn)}
        className="text-[11px] text-blue-400"
      >
        {allOn ? t('coaching.tracking.none') : t('coaching.tracking.all')}
      </button>
    </div>
  );
}

export default function TrackingVarsEditor({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-neutral-400">{t('coaching.tracking.modules')}</p>
        <Toggle
          checked={value.track_workouts}
          label={t('coaching.setup.track.workouts')}
          onChange={v => onChange({ ...value, track_workouts: v })}
        />
        <Toggle
          checked={value.track_checkins}
          label={t('coaching.setup.track.checkins')}
          onChange={v => onChange({ ...value, track_checkins: v })}
        />
        <Toggle
          checked={value.track_nutrition}
          label={t('coaching.setup.track.nutrition')}
          onChange={v => onChange({ ...value, track_nutrition: v })}
        />
        <Toggle
          checked={value.track_weight}
          label={t('coaching.setup.track.weight')}
          onChange={v => onChange({ ...value, track_weight: v })}
        />
      </div>

      {value.track_workouts && (
        <div>
          <GroupHeader
            title={t('coaching.tracking.trainingVars')}
            allOn={groupAllEnabled(value.training, TRAINING_VAR_KEYS)}
            onToggleAll={v => onChange({ ...value, training: toggleGroup(value.training, TRAINING_VAR_KEYS, v) })}
          />
          <div className="grid grid-cols-2 gap-1.5">
            {TRAINING_VAR_KEYS.map(key => (
              <Toggle
                key={key}
                checked={value.training[key]}
                label={t(`coaching.tracking.train.${key}`)}
                onChange={v => onChange({ ...value, training: { ...value.training, [key]: v } })}
              />
            ))}
          </div>
        </div>
      )}

      {value.track_nutrition && (
        <div>
          <GroupHeader
            title={t('coaching.tracking.nutritionVars')}
            allOn={groupAllEnabled(value.nutrition, NUTRITION_VAR_KEYS)}
            onToggleAll={v => onChange({ ...value, nutrition: toggleGroup(value.nutrition, NUTRITION_VAR_KEYS, v) })}
          />
          <div className="grid grid-cols-2 gap-1.5">
            {NUTRITION_VAR_KEYS.map(key => (
              <Toggle
                key={key}
                checked={value.nutrition[key]}
                label={t(`coaching.tracking.nutr.${key}`)}
                onChange={v => onChange({ ...value, nutrition: { ...value.nutrition, [key]: v } })}
              />
            ))}
          </div>
        </div>
      )}

      {value.track_checkins && (
        <div className="space-y-3" data-testid="checkin-vars-editor">
          <div>
            <GroupHeader
              title={t('coaching.tracking.checkinCore')}
              allOn={groupAllEnabled(value.checkin, CHECKIN_CORE_VAR_KEYS)}
              onToggleAll={v => onChange({ ...value, checkin: toggleGroup(value.checkin, CHECKIN_CORE_VAR_KEYS, v) })}
            />
            <p className="text-[11px] text-neutral-500 mb-1.5">{t('coaching.tracking.checkinCoreHint')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHECKIN_CORE_VAR_KEYS.map(key => (
                <Toggle
                  key={key}
                  checked={value.checkin[key]}
                  label={t(`coaching.tracking.check.${key}`)}
                  onChange={v => onChange({ ...value, checkin: { ...value.checkin, [key]: v } })}
                />
              ))}
            </div>
          </div>
          <div>
            <GroupHeader
              title={t('coaching.tracking.checkinExtra')}
              allOn={groupAllEnabled(value.checkin, CHECKIN_EXTRA_VAR_KEYS)}
              onToggleAll={v => onChange({ ...value, checkin: toggleGroup(value.checkin, CHECKIN_EXTRA_VAR_KEYS, v) })}
            />
            <p className="text-[11px] text-neutral-500 mb-1.5">{t('coaching.tracking.checkinExtraHint')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHECKIN_EXTRA_VAR_KEYS.map(key => (
                <Toggle
                  key={key}
                  checked={value.checkin[key]}
                  label={t(`coaching.tracking.check.${key}`)}
                  onChange={v => onChange({ ...value, checkin: { ...value.checkin, [key]: v } })}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { TrainingVarKey, NutritionVarKey, CheckinVarKey };
