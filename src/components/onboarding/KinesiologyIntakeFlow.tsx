import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Droplets, Flame } from 'lucide-react';
import WallSignOut from '../auth/WallSignOut';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { clearOnboardingDeferred, useCoachingStore } from '../../stores/coachingStore';
import { stripSelfServeNutritionTargets } from '../../lib/coachOwnedTargets';
import { isCoachedAthlete } from '../../lib/coachRole';
import { track } from '../../lib/telemetryClient';
import { formatNumber, todayStr } from '../../lib/utils';
import type { UserProfile } from '../../lib/types';
import {
  DUREE_OPTIONS,
  EQUIPEMENT_OPTIONS,
  EXTRA_CARDIO_OPTIONS,
  EXTRA_MEDS_OPTIONS,
  EXTRA_OBJECTIF_OPTIONS,
  EXTRA_OCCUPATION_OPTIONS,
  EXTRA_SLEEP_OPTIONS,
  LIEU_OPTIONS,
  NIVEAU_OPTIONS,
  ORIGINAL_LABELS_EN,
  ORIGINAL_LABELS_FR,
  OUI_NON,
  SEXE_OPTIONS,
  TARGETS_SCREEN_INDEX,
  TOTAL_INTAKE_SCREENS,
  TYPES_EXERCICES_OPTIONS,
  WEEKDAYS,
  deriveFoisParSemaine,
  intakeOptionLabel,
  intakeResumeScreen,
  intakeToProfilePatch,
  medicalYesFlags,
  parseIntake,
  prepareIntakeForSave,
  screenCanProceed,
  soloTargetsFromIntake,
  soloTargetsToProfilePatch,
  type KinesiologyIntake,
  type OriginalQuestionId,
  type SoloIntakeTargets,
} from '../../lib/kinesiologyIntake';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import DateField from '../ui/DateField';

function useOriginalLabel() {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  return (id: OriginalQuestionId) => (en ? ORIGINAL_LABELS_EN[id] : ORIGINAL_LABELS_FR[id]);
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-500 ${
            i < step ? 'bg-blue-500' : i === step ? 'bg-blue-400' : 'bg-neutral-800'
          }`}
        />
      ))}
    </div>
  );
}

function FieldLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  const { t } = useTranslation();
  return (
    <label className="block text-sm font-medium text-neutral-200 mb-1.5 leading-snug">
      {children}
      {optional ? <span className="text-neutral-500 font-normal"> · {t('intake.optional')}</span> : null}
    </label>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 min-h-[96px]"
    />
  );
}

/** Stored values stay canonical (FR); only the label shown follows the viewer's language. */
function useIntakeLabel(): (value: string) => string {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  return (value: string) => intakeOptionLabel(value, en);
}

function ChoiceGrid({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const label = useIntakeLabel();
  return (
    <div className="grid grid-cols-1 gap-2" role="radiogroup">
      {options.map(opt => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt)}
            className={`p-3 rounded-xl border text-left text-sm font-semibold transition-colors duration-200 ${
              selected
                ? 'border-blue-400 bg-blue-600 text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.9)]'
                : 'border-neutral-800 bg-neutral-900 text-neutral-200 [@media(hover:hover)]:hover:border-line-strong'
            }`}
          >
            {label(opt)}
          </button>
        );
      })}
    </div>
  );
}

function ChipMulti({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const label = useIntakeLabel();
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-3 py-2 rounded-full text-xs font-medium transition-colors ${
            selected.includes(opt)
              ? 'bg-blue-600 text-white ring-1 ring-blue-300/80'
              : 'bg-neutral-800/80 text-neutral-400 [@media(hover:hover)]:hover:text-white'
          }`}
        >
          {label(opt)}
        </button>
      ))}
    </div>
  );
}

function ScreenToi({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t, i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  return (
    <div className="space-y-4">
      <Input label={label('nom')} type="text" value={intake.nom} onChange={e => setIntake({ ...intake, nom: e.target.value })} autoComplete="family-name" />
      <Input label={label('prenom')} type="text" value={intake.prenom} onChange={e => setIntake({ ...intake, prenom: e.target.value })} autoComplete="given-name" />
      <Input label={label('age')} type="number" inputMode="numeric" value={intake.age} onChange={e => setIntake({ ...intake, age: e.target.value })} />
      <div>
        <FieldLabel>{label('sexeGenre')}</FieldLabel>
        <ChoiceGrid options={SEXE_OPTIONS} value={intake.sexeGenre} onChange={sexeGenre => setIntake({ ...intake, sexeGenre })} />
      </div>
      <Input label={label('tailleCm')} type="number" inputMode="decimal" value={intake.tailleCm} onChange={e => setIntake({ ...intake, tailleCm: e.target.value })} />
      <Input label={label('poidsApproxKg')} type="number" inputMode="decimal" value={intake.poidsApproxKg} onChange={e => setIntake({ ...intake, poidsApproxKg: e.target.value })} />
      <div>
        <FieldLabel optional>{t('intake.extras.occupation')}</FieldLabel>
        <ChoiceGrid
          options={EXTRA_OCCUPATION_OPTIONS.map(o => (en ? o.labelEn : o.labelFr))}
          value={EXTRA_OCCUPATION_OPTIONS.find(o => o.value === intake.extras.occupation)?.[en ? 'labelEn' : 'labelFr'] ?? ''}
          onChange={picked => {
            const found = EXTRA_OCCUPATION_OPTIONS.find(o => o.labelFr === picked || o.labelEn === picked);
            setIntake({ ...intake, extras: { ...intake.extras, occupation: found?.value ?? '' } });
          }}
        />
      </div>
      <div>
        <FieldLabel optional>{t('intake.extras.sommeil')}</FieldLabel>
        <ChoiceGrid
          options={EXTRA_SLEEP_OPTIONS.map(o => (en ? o.labelEn : o.labelFr))}
          value={EXTRA_SLEEP_OPTIONS.find(o => o.value === intake.extras.sommeil)?.[en ? 'labelEn' : 'labelFr'] ?? ''}
          onChange={picked => {
            const found = EXTRA_SLEEP_OPTIONS.find(o => o.labelFr === picked || o.labelEn === picked);
            setIntake({ ...intake, extras: { ...intake.extras, sommeil: found?.value ?? '' } });
          }}
        />
      </div>
    </div>
  );
}

function ScreenObjectif({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t, i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>{t('intake.extras.objectifType')}</FieldLabel>
        <ChoiceGrid
          options={EXTRA_OBJECTIF_OPTIONS.map(o => (en ? o.labelEn : o.labelFr))}
          value={
            EXTRA_OBJECTIF_OPTIONS.find(o => o.value === intake.extras.objectifType)?.[en ? 'labelEn' : 'labelFr'] ?? ''
          }
          onChange={picked => {
            const found = EXTRA_OBJECTIF_OPTIONS.find(o => o.labelFr === picked || o.labelEn === picked);
            setIntake({ ...intake, extras: { ...intake.extras, objectifType: found?.value ?? '' } });
          }}
        />
      </div>
      <div>
        <FieldLabel optional>{label('objectifPrincipal')}</FieldLabel>
        <TextArea value={intake.objectifPrincipal} onChange={objectifPrincipal => setIntake({ ...intake, objectifPrincipal })} />
      </div>
      <div>
        <FieldLabel optional>{t('intake.extras.pourquoiMaintenant')}</FieldLabel>
        <TextArea value={intake.extras.pourquoiMaintenant} onChange={pourquoiMaintenant => setIntake({ ...intake, extras: { ...intake.extras, pourquoiMaintenant } })} />
      </div>
      <Input
        label={`${t('intake.extras.poidsVise')} · ${t('intake.optional')}`}
        type="number"
        inputMode="decimal"
        value={intake.extras.poidsViseKg}
        onChange={e => setIntake({ ...intake, extras: { ...intake.extras, poidsViseKg: e.target.value } })}
      />
      <DateField
        label={`${t('intake.extras.dateCible')} · ${t('intake.optional')}`}
        value={intake.extras.dateCible}
        onChange={dateCible => setIntake({ ...intake, extras: { ...intake.extras, dateCible } })}
      />
      <div>
        <FieldLabel optional>{label('depuisCombienDeTemps')}</FieldLabel>
        <TextArea value={intake.depuisCombienDeTemps} onChange={depuisCombienDeTemps => setIntake({ ...intake, depuisCombienDeTemps })} />
      </div>
    </div>
  );
}

function ScreenTemps({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>{label('niveauActuel')}</FieldLabel>
        <ChoiceGrid options={NIVEAU_OPTIONS} value={intake.niveauActuel} onChange={niveauActuel => setIntake({ ...intake, niveauActuel })} />
      </div>
      <Input
        label={label('seancesRealistes')}
        type="number"
        inputMode="numeric"
        value={intake.seancesRealistes}
        onChange={e => {
          const seancesRealistes = e.target.value;
          setIntake({
            ...intake,
            seancesRealistes,
            foisParSemaine: deriveFoisParSemaine(seancesRealistes),
          });
        }}
      />
      <div>
        <FieldLabel optional>{t('intake.extras.joursDispo')}</FieldLabel>
        <ChipMulti
          options={WEEKDAYS.map(d => t(`intake.weekdays.${d}`))}
          selected={intake.extras.joursDispo.map(d => t(`intake.weekdays.${d}`))}
          onChange={labels => {
            const next = WEEKDAYS.filter(d => labels.includes(t(`intake.weekdays.${d}`)));
            setIntake({ ...intake, extras: { ...intake.extras, joursDispo: [...next] } });
          }}
        />
      </div>
      <div>
        <FieldLabel>{label('dureeIdeale')}</FieldLabel>
        <ChoiceGrid options={DUREE_OPTIONS} value={intake.dureeIdeale} onChange={dureeIdeale => setIntake({ ...intake, dureeIdeale })} />
      </div>
      <div>
        <FieldLabel optional>{label('programmeStructure')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.programmeStructure} onChange={programmeStructure => setIntake({ ...intake, programmeStructure })} />
      </div>
    </div>
  );
}

function ScreenLieu({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t, i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>{label('lieu')}</FieldLabel>
        <ChoiceGrid options={LIEU_OPTIONS} value={intake.lieu} onChange={lieu => setIntake({ ...intake, lieu })} />
      </div>
      <div>
        <FieldLabel>{label('equipement')}</FieldLabel>
        <ChipMulti options={EQUIPEMENT_OPTIONS} selected={intake.equipement} onChange={equipement => setIntake({ ...intake, equipement })} />
      </div>
      {intake.equipement.includes('Autre') && (
        <Input
          label="Autre"
          value={intake.equipementAutre}
          onChange={e => setIntake({ ...intake, equipementAutre: e.target.value })}
        />
      )}
      <div>
        <FieldLabel optional>{t('intake.extras.cardio')}</FieldLabel>
        <ChoiceGrid
          options={EXTRA_CARDIO_OPTIONS.map(o => (en ? o.labelEn : o.labelFr))}
          value={EXTRA_CARDIO_OPTIONS.find(o => o.value === intake.extras.cardio)?.[en ? 'labelEn' : 'labelFr'] ?? ''}
          onChange={picked => {
            const found = EXTRA_CARDIO_OPTIONS.find(o => o.labelFr === picked || o.labelEn === picked);
            setIntake({ ...intake, extras: { ...intake.extras, cardio: found?.value ?? '' } });
          }}
        />
      </div>
    </div>
  );
}

function ScreenDouleurs({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t } = useTranslation();
  const extras = intake.extras;
  const patch = (next: Partial<KinesiologyIntake['extras']>) =>
    setIntake({ ...intake, extras: { ...extras, ...next } });
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>{label('douleursLimitations')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.douleursLimitations} onChange={douleursLimitations => setIntake({ ...intake, douleursLimitations })} />
      </div>
      {intake.douleursLimitations === 'Oui' && (
        <>
          <div>
            <FieldLabel>{label('mouvementAEviter')}</FieldLabel>
            <TextArea value={intake.mouvementAEviter} onChange={mouvementAEviter => setIntake({ ...intake, mouvementAEviter })} />
          </div>
          <Input label={`${t('intake.extras.douleurOu')} · ${t('intake.optional')}`} value={extras.douleurOu} onChange={e => patch({ douleurOu: e.target.value })} />
          <Input
            label={`${t('intake.extras.douleurIntensite')} · ${t('intake.optional')}`}
            type="number"
            min={0}
            max={10}
            value={extras.douleurIntensite}
            onChange={e => patch({ douleurIntensite: e.target.value })}
          />
          <Input label={`${t('intake.extras.douleurDepuis')} · ${t('intake.optional')}`} value={extras.douleurDepuis} onChange={e => patch({ douleurDepuis: e.target.value })} />
          <div>
            <FieldLabel optional>{t('intake.extras.physioEnCours')}</FieldLabel>
            <ChoiceGrid options={OUI_NON} value={extras.physioEnCours} onChange={physioEnCours => patch({ physioEnCours })} />
          </div>
        </>
      )}
    </div>
  );
}

function ScreenMedical({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  const { t } = useTranslation();
  const extras = intake.extras;
  const patch = (next: Partial<KinesiologyIntake['extras']>) =>
    setIntake({ ...intake, extras: { ...extras, ...next } });
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>{label('blessuresChirurgies')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.blessuresChirurgies} onChange={blessuresChirurgies => setIntake({ ...intake, blessuresChirurgies })} />
      </div>
      {intake.blessuresChirurgies === 'Oui' && (
        <>
          <div>
            <FieldLabel>{label('descriptionBlessures')}</FieldLabel>
            <TextArea value={intake.descriptionBlessures} onChange={descriptionBlessures => setIntake({ ...intake, descriptionBlessures })} />
          </div>
          <Input label={`${t('intake.extras.blessureAnnee')} · ${t('intake.optional')}`} value={extras.blessureAnnee} onChange={e => patch({ blessureAnnee: e.target.value })} />
          <Input label={`${t('intake.extras.blessureSuivi')} · ${t('intake.optional')}`} value={extras.blessureSuivi} onChange={e => patch({ blessureSuivi: e.target.value })} />
        </>
      )}
      <div>
        <FieldLabel>{label('cardiaqueHtaPoitrine')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.cardiaqueHtaPoitrine} onChange={cardiaqueHtaPoitrine => setIntake({ ...intake, cardiaqueHtaPoitrine })} />
      </div>
      <div>
        <FieldLabel>{label('etourdissementsEquilibre')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.etourdissementsEquilibre} onChange={etourdissementsEquilibre => setIntake({ ...intake, etourdissementsEquilibre })} />
      </div>
      <div>
        <FieldLabel>{label('medecinLimiteExercices')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={intake.medecinLimiteExercices} onChange={medecinLimiteExercices => setIntake({ ...intake, medecinLimiteExercices })} />
      </div>
      {medicalYesFlags(intake) && (
        <div>
          <FieldLabel>{label('conditionMedicalePrecise')}</FieldLabel>
          <TextArea value={intake.conditionMedicalePrecise} onChange={conditionMedicalePrecise => setIntake({ ...intake, conditionMedicalePrecise })} />
        </div>
      )}
      <div>
        <FieldLabel optional>{t('intake.extras.medicamentsEffort')}</FieldLabel>
        <ChoiceGrid options={EXTRA_MEDS_OPTIONS} value={extras.medicamentsEffort} onChange={medicamentsEffort => patch({ medicamentsEffort })} />
      </div>
      <div>
        <FieldLabel optional>{t('intake.extras.grossesse')}</FieldLabel>
        <ChoiceGrid options={OUI_NON} value={extras.grossessePostpartumTraitement} onChange={grossessePostpartumTraitement => patch({ grossessePostpartumTraitement })} />
      </div>
    </div>
  );
}

function ScreenPrefs({
  intake,
  setIntake,
  label,
}: {
  intake: KinesiologyIntake;
  setIntake: (next: KinesiologyIntake) => void;
  label: (id: OriginalQuestionId) => string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>{label('typesExercices')}</FieldLabel>
        <ChipMulti options={TYPES_EXERCICES_OPTIONS} selected={intake.typesExercices} onChange={typesExercices => setIntake({ ...intake, typesExercices })} />
      </div>
      {intake.typesExercices.includes('Autre') && (
        <Input
          label="Autre"
          value={intake.typesExercicesAutre}
          onChange={e => setIntake({ ...intake, typesExercicesAutre: e.target.value })}
        />
      )}
      <div>
        <FieldLabel optional>{label('exercicesDetestes')}</FieldLabel>
        <TextArea value={intake.exercicesDetestes} onChange={exercicesDetestes => setIntake({ ...intake, exercicesDetestes })} />
      </div>
      <div>
        <FieldLabel optional>{label('prefereProgramme')}</FieldLabel>
        <TextArea value={intake.prefereProgramme} onChange={prefereProgramme => setIntake({ ...intake, prefereProgramme })} />
      </div>
      <div>
        <FieldLabel optional>{label('quelqueChoseImportant')}</FieldLabel>
        <TextArea value={intake.quelqueChoseImportant} onChange={quelqueChoseImportant => setIntake({ ...intake, quelqueChoseImportant })} />
      </div>
    </div>
  );
}

function TargetTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tone}`}>
        {value}
        <span className="text-xs font-medium text-neutral-500 ml-1">{unit}</span>
      </p>
    </div>
  );
}

function ScreenTargets({ targets }: { targets: SoloIntakeTargets | null }) {
  const { t, i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith('en');
  if (!targets) {
    return <p className="text-sm text-amber-200">{t('intake.targets.unavailable')}</p>;
  }
  const goal = EXTRA_OBJECTIF_OPTIONS.find(o => o.value === targets.goal);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
        <p className="text-sm font-medium text-blue-200">{t('intake.targets.title')}</p>
        <p className="text-xs text-neutral-400 mt-1">
          {t('intake.targets.basis', {
            goal: goal ? (en ? goal.labelEn : goal.labelFr) : '—',
            tdee: targets.tdee,
          })}
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
        <div className="w-11 h-11 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
          <Flame size={20} className="text-orange-400" />
        </div>
        <div>
          <p className="text-[11px] text-neutral-500">{t('intake.targets.calories')}</p>
          <p className="text-2xl font-bold text-white">
            {targets.calories}
            <span className="text-sm font-medium text-neutral-500 ml-1">kcal</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <TargetTile label={t('common.protein')} value={targets.protein} unit="g" tone="text-sky-300" />
        <TargetTile label={t('common.carbs')} value={targets.carbs} unit="g" tone="text-amber-300" />
        <TargetTile label={t('common.fat')} value={targets.fat} unit="g" tone="text-rose-300" />
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <Droplets size={14} className="text-cyan-400" />
        {t('intake.targets.water', { liters: formatNumber(targets.water_ml / 1000, { minDigits: 1 }) })}
      </div>
      <p className="text-xs text-neutral-500">{t('intake.targets.hint')}</p>
    </div>
  );
}

export default function KinesiologyIntakeFlow({ allowExit = false }: { allowExit?: boolean }) {
  const { t } = useTranslation();
  const label = useOriginalLabel();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { addMeasurement } = useWeightStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const coached = isCoachedAthlete(coachingRole, myCoach);
  // Solo first run: the intake IS the onboarding, so it ends on computed targets.
  // A coached client never sees them (the coach decides); a solo revisiting keeps the targets he tuned.
  const showTargets = !coached && !profile?.onboarding_completed;
  const totalScreens = showTargets ? TOTAL_INTAKE_SCREENS + 1 : TOTAL_INTAKE_SCREENS;
  const lastScreen = showTargets ? TARGETS_SCREEN_INDEX : TOTAL_INTAKE_SCREENS - 1;

  const [intake, setIntake] = useState<KinesiologyIntake>(() => parseIntake(profile?.kinesiology_intake));
  const [step, setStep] = useState(() => intakeResumeScreen(parseIntake(profile?.kinesiology_intake)));
  const [saving, setSaving] = useState(false);
  /** D03 : état visible de la sauvegarde brouillon (jamais de faux succès). */
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** D03 : chaîne de sauvegardes — pas de réponses hors ordre, pas d'écrasement. */
  const saveChain = useRef<Promise<{ error: string | null }>>(Promise.resolve({ error: null }));
  const targets = useMemo(() => (showTargets ? soloTargetsFromIntake(intake) : null), [showTargets, intake]);

  const titles = [
    t('intake.screens.you'),
    t('intake.screens.goal'),
    t('intake.screens.time'),
    t('intake.screens.place'),
    t('intake.screens.pain'),
    t('intake.screens.medical'),
    t('intake.screens.prefs'),
    t('intake.screens.targets'),
  ];

  /**
   * D03 : brouillon séquencé à chaque « Continuer ». Les sauvegardes partent
   * dans l'ordre des clics ; un échec est affiché (pas de faux succès) et la
   * sauvegarde suivante réessaie implicitement avec l'état complet.
   */
  const persistDraft = (snapshot: KinesiologyIntake): Promise<{ error: string | null }> => {
    if (!user) return Promise.resolve({ error: null });
    setDraftState('saving');
    const payload = { ...prepareIntakeForSave(snapshot) };
    saveChain.current = saveChain.current
      .then(() => updateProfile(user.id, { kinesiology_intake: payload }))
      .then(result => {
        setDraftState(result.error ? 'error' : 'saved');
        return result;
      });
    return saveChain.current;
  };

  const finish = async () => {
    if (!user || saving) return;
    setSaving(true);
    // Vide la file des brouillons avant le patch final (ordre garanti).
    await saveChain.current.catch(() => ({ error: null as string | null }));
    const completedAt = new Date().toISOString();
    let patch = intakeToProfilePatch(intake, completedAt);
    if (showTargets && targets) patch = { ...patch, ...soloTargetsToProfilePatch(targets) };
    patch = stripSelfServeNutritionTargets(patch, coached);
    // D03 : la complétude n'est confirmée qu'après persistance réelle.
    const saved = await updateProfile(user.id, patch as Partial<UserProfile>);
    if (saved.error) {
      setSaving(false);
      toast(userFacingError(saved.error, t('errors.generic')), 'error');
      return;
    }
    const kg = Number(intake.poidsApproxKg);
    if (Number.isFinite(kg) && kg > 0) {
      await addMeasurement({ user_id: user.id, weight_kg: kg, measured_at: todayStr() });
    }
    // Q07 : analytics général rattaché au compte — aucun signal de santé ici.
    // (drapeaux médicaux, douleurs, blessures : dossier coach uniquement, jamais d'event).
    track('intake_completed', {
      revisit: allowExit,
      targets_computed: !!(showTargets && targets),
    });
    clearOnboardingDeferred();
    navigate('/dashboard');
  };

  const goNext = () => {
    if (step === lastScreen) {
      void finish();
      return;
    }
    void persistDraft(intake);
    setStep(s => Math.min(lastScreen, s + 1));
  };

  return (
    <div className="min-h-screen w-full bg-black">
      <div className="mx-auto w-full max-w-lg px-5 pt-8 pb-32">
        {allowExit ? (
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-sm text-neutral-400 [@media(hover:hover)]:hover:text-white"
            >
              {t('intake.later')}
            </button>
          </div>
        ) : (
          <div className="flex justify-end mb-3">
            <WallSignOut />
          </div>
        )}
        <ProgressBar step={step} total={totalScreens} />
        {draftState !== 'idle' ? (
          <p
            className={`text-[11px] mb-1 ${
              draftState === 'error' ? 'text-red-400' : draftState === 'saving' ? 'text-neutral-500' : 'text-emerald-500/80'
            }`}
            role={draftState === 'error' ? 'alert' : 'status'}
          >
            {draftState === 'saving' ? t('intake.draftSaving') : draftState === 'saved' ? t('intake.draftSaved') : t('intake.draftError')}
          </p>
        ) : null}
        <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
          {t('onboarding.stepOf', { step: step + 1, total: totalScreens })}
        </p>
        <h1 className="text-2xl font-bold text-white mb-6 tracking-tight">{titles[step]}</h1>
        <Card>
          {step === 0 && <ScreenToi intake={intake} setIntake={setIntake} label={label} />}
          {step === 1 && <ScreenObjectif intake={intake} setIntake={setIntake} label={label} />}
          {step === 2 && <ScreenTemps intake={intake} setIntake={setIntake} label={label} />}
          {step === 3 && <ScreenLieu intake={intake} setIntake={setIntake} label={label} />}
          {step === 4 && <ScreenDouleurs intake={intake} setIntake={setIntake} label={label} />}
          {step === 5 && <ScreenMedical intake={intake} setIntake={setIntake} label={label} />}
          {step === 6 && <ScreenPrefs intake={intake} setIntake={setIntake} label={label} />}
          {step === TARGETS_SCREEN_INDEX && <ScreenTargets targets={targets} />}
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur-lg border-t border-neutral-900 p-4">
        <div className="w-full max-w-lg mx-auto flex gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)} className="flex-shrink-0">
              <ChevronLeft size={16} />
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={(step < TOTAL_INTAKE_SCREENS && !screenCanProceed(intake, step)) || saving}
            loading={saving && step === lastScreen}
            className="flex-1"
          >
            {step === lastScreen
              ? (coached ? t('intake.submit') : t('intake.finishSolo'))
              : t('onboarding.continue')}
            {step !== lastScreen && <ChevronRight size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
