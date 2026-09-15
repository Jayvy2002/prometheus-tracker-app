import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EMPTY_INTAKE_USAGE,
  ORIGINAL_LABELS_FR,
  ORIGINAL_QUESTION_IDS,
  deriveFoisParSemaine,
  emptyIntake,
  formatAnswer,
  intakeGateNeedsUsageProbe,
  intakeResumeScreen,
  intakeToProfilePatch,
  isIntakeAlreadyFilled,
  medicalFlagIds,
  originalAnswersComplete,
  parseIntake,
  prepareIntakeForSave,
  profileHasMedicalFlags,
  profileShowsExistingAppUse,
  screenCanProceed,
  shouldForceKinesiologyIntake,
  shouldSkipKinesiologyIntake,
  soloTargetsFromIntake,
  soloTargetsToProfilePatch,
  TYPES_EXERCICES_OPTIONS,
  DUREE_OPTIONS,
  EQUIPEMENT_OPTIONS,
  EXTRA_MEDS_OPTIONS,
  LIEU_OPTIONS,
  NIVEAU_OPTIONS,
  OUI_NON,
  SEXE_OPTIONS,
  hasIntakeOptionLabelEn,
  intakeOptionLabel,
  intakeAvailableWeekdays,
  nextProgramWeekday,
  INTAKE_WEEKDAY_TO_JS,
} from './kinesiologyIntake';

const EXPECTED_FR: Record<string, string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  age: 'Age',
  sexeGenre: 'Sexe/Genre',
  tailleCm: 'Taille (cm)',
  poidsApproxKg: 'Poids approximatif (kg)',
  objectifPrincipal: 'Quel est ton objectif principal',
  depuisCombienDeTemps: 'Depuis combien de temps poursuis-tu cet objectif?',
  niveauActuel: 'Quel est ton niveau actuel?',
  foisParSemaine: 'Combien de fois par semaine?',
  programmeStructure: 'As-tu déjà suivi un programme structuré?',
  seancesRealistes: 'Combien de séances par semaine peux-tu réalistement faire?',
  dureeIdeale: "Durée idéale d'une séance",
  lieu: "Où t'entraînes-tu principalement ?",
  equipement: 'Équipement disponible (plusieurs choix possibles)',
  douleursLimitations: 'As-tu actuellement des douleurs ou limitations qui affectent tes mouvements ?',
  mouvementAEviter: 'Description du mouvement à éviter (si oui)',
  blessuresChirurgies: 'As-tu déjà eu des blessures importantes, des chirurgies ou opérations quelconques ?',
  descriptionBlessures: 'Description de la ou des blessure(s) / chirurgie(s) / opération(s) (si oui)',
  cardiaqueHtaPoitrine: "Condition cardiaque, hypertension non contrôlée, ou douleurs à la poitrine à l'effort ?",
  etourdissementsEquilibre: "Étourdissements, pertes d'équilibre ou essoufflement inhabituel ?",
  medecinLimiteExercices: "Un médecin t'a-t-il déjà recommandé de limiter certains exercices ?",
  conditionMedicalePrecise: "Condition médicale précise (si oui à l'une des réponses précédentes)",
  typesExercices: "Quels types d'exercices préfères-tu ?",
  exercicesDetestes: 'Des exercices que tu détestes ou que tu veux absolument éviter ?',
  prefereProgramme: 'Préfères-tu un programme ?',
  quelqueChoseImportant: "Y a-t-il quelque chose d'important que je devrais absolument savoir ?",
};

function completeOriginal(partial: Record<string, unknown> = {}) {
  const intake = emptyIntake();
  Object.assign(intake, {
    nom: 'Petit',
    prenom: 'Angélique',
    age: '34',
    sexeGenre: 'F',
    tailleCm: '165',
    poidsApproxKg: '62',
    objectifPrincipal: 'Perdre du gras tout en gardant du muscle',
    depuisCombienDeTemps: '6 mois',
    niveauActuel: 'Débutant (moins de 6-12 mois réguliers)',
    foisParSemaine: '3-4',
    programmeStructure: 'Non',
    seancesRealistes: '3',
    dureeIdeale: '45-60 mins',
    lieu: 'Mixte',
    equipement: ['Haltères libres', 'Banc', 'Bandes élastiques'],
    douleursLimitations: 'Non',
    blessuresChirurgies: 'Non',
    cardiaqueHtaPoitrine: 'Non',
    etourdissementsEquilibre: 'Non',
    medecinLimiteExercices: 'Non',
    typesExercices: ['Charges libres (haltères / barre)'],
    exercicesDetestes: '',
    prefereProgramme: 'Varie et stimulant',
    quelqueChoseImportant: '',
    extras: { ...emptyIntake().extras, objectifType: 'cut' },
    ...partial,
  });
  return intake;
}

describe('kinesiologyIntake original form', () => {
  it('keeps all 27 original French labels verbatim', () => {
    assert.equal(ORIGINAL_QUESTION_IDS.length, 27);
    assert.deepEqual({ ...ORIGINAL_LABELS_FR }, EXPECTED_FR);
  });

  it('keeps age as age, not date of birth', () => {
    const intake = emptyIntake();
    assert.equal('age' in intake, true);
    assert.equal('dateOfBirth' in intake, false);
    assert.equal(ORIGINAL_LABELS_FR.age, 'Age');
    const patch = intakeToProfilePatch(completeOriginal(), '2026-09-02T00:00:00.000Z');
    assert.equal('date_of_birth' in patch, false);
  });

  it('keeps objectif principal and programme preference as free text', () => {
    const intake = completeOriginal({
      objectifPrincipal: 'Perdre du gras tout en gardant du muscle',
      prefereProgramme: 'Varie et stimulant',
    });
    assert.equal(typeof intake.objectifPrincipal, 'string');
    assert.equal(typeof intake.prefereProgramme, 'string');
    assert.equal(intake.objectifPrincipal.includes('Perdre du gras'), true);
    assert.doesNotMatch(intake.prefereProgramme, /^(strength|hypertrophy|mixed)$/);
  });

  it('does not put extra fields in the original 27 ids', () => {
    const extras = [
      'poidsViseKg', 'occupation', 'dateCible', 'pourquoiMaintenant', 'joursDispo',
      'douleurOu', 'medicamentsEffort', 'sommeil', 'cardio',
    ];
    for (const key of extras) {
      assert.equal((ORIGINAL_QUESTION_IDS as string[]).includes(key), false);
    }
  });

  it('never writes kcal or macros from the form', () => {
    const patch = intakeToProfilePatch(completeOriginal({
      extras: { ...emptyIntake().extras, objectifType: 'cut', poidsViseKg: '58' },
    }), '2026-09-02T00:00:00.000Z');
    assert.equal('daily_calorie_target' in patch, false);
    assert.equal('protein_target' in patch, false);
    assert.equal('carbs_target' in patch, false);
    assert.equal('fat_target' in patch, false);
    assert.equal(patch.target_weight_kg, 58);
    assert.equal(patch.onboarding_completed, true);
    assert.equal(patch.full_name, 'Angélique Petit');
    assert.equal(patch.gender, 'female');
  });

  it('structured goal type maps to user_profiles.goal; free text stays free', () => {
    const cut = intakeToProfilePatch(completeOriginal(), '2026-09-02T00:00:00.000Z');
    assert.equal(cut.goal, 'cut');
    const bulk = intakeToProfilePatch(completeOriginal({
      extras: { ...emptyIntake().extras, objectifType: 'bulk' },
    }), '2026-09-02T00:00:00.000Z');
    assert.equal(bulk.goal, 'bulk');
    const none = intakeToProfilePatch(completeOriginal({
      extras: { ...emptyIntake().extras, objectifType: 'whatever' },
    }), '2026-09-02T00:00:00.000Z');
    assert.equal('goal' in none, false);
    assert.equal((ORIGINAL_QUESTION_IDS as string[]).includes('objectifType'), false);

    const screen = completeOriginal({ extras: { ...emptyIntake().extras, objectifType: '' } });
    assert.equal(screenCanProceed(screen, 1), false);
    screen.extras.objectifType = 'maintain';
    assert.equal(screenCanProceed(screen, 1), true);
    assert.equal(parseIntake({ extras: { objectifType: 'bulk' } }).extras.objectifType, 'bulk');
  });

  it('medical flags: any « Oui » on the PAR-Q questions is a coach flag', () => {
    assert.deepEqual(medicalFlagIds(completeOriginal()), []);
    assert.equal(profileHasMedicalFlags(completeOriginal()), false);
    const flagged = completeOriginal({
      etourdissementsEquilibre: 'Oui',
      medecinLimiteExercices: 'Oui',
      conditionMedicalePrecise: 'Vertiges positionnels',
    });
    assert.deepEqual(medicalFlagIds(flagged), ['etourdissementsEquilibre', 'medecinLimiteExercices']);
    assert.equal(profileHasMedicalFlags(flagged), true);
    assert.equal(profileHasMedicalFlags(null), false);
    assert.equal(profileHasMedicalFlags({ cardiaqueHtaPoitrine: 'Oui' }), true);
  });

  it('requires original screens and conditional descriptions', () => {
    const blank = emptyIntake();
    assert.equal(screenCanProceed(blank, 0), false);
    assert.equal(originalAnswersComplete(blank), false);

    const ready = completeOriginal();
    assert.equal(screenCanProceed(ready, 0), true);
    assert.equal(screenCanProceed(ready, 7), false);
    assert.equal(originalAnswersComplete(ready), true);

    assert.equal(screenCanProceed(completeOriginal({
      objectifPrincipal: '',
      depuisCombienDeTemps: '',
      foisParSemaine: '',
      programmeStructure: '',
      prefereProgramme: '',
    }), 1), true);
    assert.equal(originalAnswersComplete(completeOriginal({
      objectifPrincipal: '',
      depuisCombienDeTemps: '',
      foisParSemaine: '',
      programmeStructure: '',
      prefereProgramme: '',
    })), true);

    const pain = completeOriginal({ douleursLimitations: 'Oui', mouvementAEviter: '' });
    assert.equal(screenCanProceed(pain, 4), false);
    pain.mouvementAEviter = 'Pas de overhead';
    assert.equal(screenCanProceed(pain, 4), true);

    const heart = completeOriginal({ cardiaqueHtaPoitrine: 'Oui', conditionMedicalePrecise: '' });
    assert.equal(screenCanProceed(heart, 5), false);
    heart.conditionMedicalePrecise = 'HTA suivie';
    assert.equal(screenCanProceed(heart, 5), true);
  });

  it('derives foisParSemaine and fills objectifPrincipal on save, without a extras dump screen', () => {
    assert.equal(deriveFoisParSemaine('1'), '1-2');
    assert.equal(deriveFoisParSemaine('3'), '3-4');
    assert.equal(deriveFoisParSemaine('5'), '5-6');
    assert.equal(deriveFoisParSemaine('7'), '7+');
    const prepared = prepareIntakeForSave(completeOriginal({
      objectifPrincipal: '',
      foisParSemaine: '',
      seancesRealistes: '3',
    }));
    assert.equal(prepared.foisParSemaine, '3-4');
    assert.equal(prepared.objectifPrincipal, 'Perdre du gras');
    const patch = intakeToProfilePatch(completeOriginal({
      objectifPrincipal: '',
      foisParSemaine: '',
      seancesRealistes: '5',
    }), '2026-09-06T00:00:00.000Z');
    const stored = patch.kinesiology_intake as ReturnType<typeof emptyIntake>;
    assert.equal(stored.foisParSemaine, '5-6');
    assert.equal(stored.objectifPrincipal, 'Perdre du gras');
  });

  it('only completed_at counts — a fully answered draft is still a draft (resume must not lift the wall)', () => {
    assert.equal(isIntakeAlreadyFilled(null), false);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake_completed_at: '2026-09-01' }), true);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake: completeOriginal() }), false);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake: emptyIntake() }), false);
  });

  it('resumes a saved draft on the first screen that cannot proceed', () => {
    assert.equal(intakeResumeScreen(emptyIntake()), 0);
    const midway = completeOriginal({ lieu: '', equipement: [] });
    assert.equal(intakeResumeScreen(midway), 3);
    const onlyPrefsMissing = completeOriginal({ typesExercices: [] });
    assert.equal(intakeResumeScreen(onlyPrefsMissing), 6);
    assert.equal(intakeResumeScreen(completeOriginal()), 6);
    const startedExtras = completeOriginal({
      extras: { ...emptyIntake().extras, objectifType: 'cut', sommeil: '7_8' },
    });
    assert.equal(intakeResumeScreen(startedExtras), 6);
  });

  it('solo targets: Mifflin-St Jeor + activity + goal, ISSN protein, never for a coached client', () => {
    const solo = completeOriginal({
      extras: { ...emptyIntake().extras, objectifType: 'cut', occupation: 'sitting' },
    });
    const targets = soloTargetsFromIntake(solo);
    assert.ok(targets);
    // 62 kg, 165 cm, 34 y, F → BMR 1320 ; 3 séances = moderate ×1.55 → TDEE 2046 ; cut −500 → 1546
    // Sitting does not replace the training band (that used to underfeed desk athletes at 1084).
    assert.equal(targets.bmr, 1320);
    assert.equal(targets.tdee, 2046);
    assert.equal(targets.calories, 1546);
    assert.equal(targets.goal, 'cut');
    assert.equal(targets.activity_level, 'moderate');
    assert.ok(targets.protein > 0 && targets.carbs > 0 && targets.fat > 0);
    assert.ok(Math.abs(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9 - targets.calories) <= targets.calories * 0.15);
    assert.ok(targets.water_ml >= 1500);

    const patch = soloTargetsToProfilePatch(targets);
    assert.equal(patch.daily_calorie_target, 1546);
    assert.equal(patch.goal, 'cut');
    assert.equal(patch.activity_level, 'moderate');
    assert.equal(patch.daily_water_target_ml, targets.water_ml);

    const bulkPhysical = soloTargetsFromIntake(completeOriginal({
      sexeGenre: 'H',
      seancesRealistes: '5',
      extras: { ...emptyIntake().extras, objectifType: 'bulk', occupation: 'physical' },
    }));
    assert.ok(bulkPhysical && bulkPhysical.calories > targets.calories);
    assert.equal(bulkPhysical.activity_level, 'very_active');

    const deskZero = soloTargetsFromIntake(completeOriginal({
      seancesRealistes: '0',
      extras: { ...emptyIntake().extras, objectifType: 'cut', occupation: 'sitting' },
    }));
    assert.ok(deskZero);
    assert.equal(deskZero.activity_level, 'sedentary');
    assert.equal(deskZero.tdee, 1584);
    assert.equal(deskZero.calories, 1320);

    const other = soloTargetsFromIntake(completeOriginal({ sexeGenre: 'Autre' }));
    assert.ok(other && other.bmr > 1320 && other.bmr < 1320 + 166);

    assert.equal(soloTargetsFromIntake(completeOriginal({ tailleCm: '' })), null);
    assert.equal(soloTargetsFromIntake(completeOriginal({ age: '5' })), null);
  });

  it('solo: the intake is the onboarding — walled even when the usage probe failed', () => {
    const freshSolo = {
      full_name: '',
      onboarding_completed: false,
      height_cm: 0,
      weight_kg: 0,
      kinesiology_intake_completed_at: null,
      kinesiology_intake: emptyIntake(),
    };
    assert.equal(intakeGateNeedsUsageProbe({ isCoachedClient: false, isCoach: false, profile: freshSolo }), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: false, isCoach: false, profile: freshSolo, usage: EMPTY_INTAKE_USAGE, probeStatus: 'ok',
    }), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: false, isCoach: false, profile: freshSolo, usage: null, probeStatus: 'failed',
    }), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: false, isCoach: false, profile: freshSolo, usage: null, probeStatus: 'pending',
    }), false);
    // Legacy solo who went through the tracker onboarding: never walled.
    assert.equal(intakeGateNeedsUsageProbe({
      isCoachedClient: false, isCoach: false, profile: { ...freshSolo, onboarding_completed: true },
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: false, isCoach: false, profile: freshSolo,
      usage: { hasWorkout: true, hasNutrition: false, hasCheckIn: false, hasWeight: false }, probeStatus: 'ok',
    }), false);
    // Coach: never.
    assert.equal(intakeGateNeedsUsageProbe({ isCoachedClient: false, isCoach: true, profile: freshSolo }), false);
  });

  it('linked client with history must not be forced into KinesiologyIntakeFlow', () => {
    const hugoProfile = {
      full_name: 'Hugo Demo',
      onboarding_completed: true,
      height_cm: 178,
      weight_kg: 82,
      kinesiology_intake_completed_at: null,
      kinesiology_intake: emptyIntake(),
    };
    const hugoUsage = {
      hasWorkout: true,
      hasNutrition: true,
      hasCheckIn: true,
      hasWeight: true,
    };

    assert.equal(profileShowsExistingAppUse(hugoProfile), true);
    assert.equal(shouldSkipKinesiologyIntake(hugoProfile, EMPTY_INTAKE_USAGE), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: hugoProfile,
      usage: hugoUsage,
      probeStatus: 'ok',
    }), false);
    assert.equal(intakeGateNeedsUsageProbe({
      isCoachedClient: true,
      isCoach: false,
      profile: hugoProfile,
    }), false);

    const historyOnly = {
      full_name: '',
      onboarding_completed: false,
      height_cm: 0,
      weight_kg: 0,
      kinesiology_intake_completed_at: null,
      kinesiology_intake: emptyIntake(),
    };
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: historyOnly,
      usage: { hasWorkout: true, hasNutrition: false, hasCheckIn: false, hasWeight: false },
      probeStatus: 'ok',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: historyOnly,
      usage: { hasWorkout: false, hasNutrition: true, hasCheckIn: false, hasWeight: false },
      probeStatus: 'ok',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: historyOnly,
      usage: { hasWorkout: false, hasNutrition: false, hasCheckIn: true, hasWeight: false },
      probeStatus: 'ok',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: historyOnly,
      usage: { hasWorkout: false, hasNutrition: false, hasCheckIn: false, hasWeight: true },
      probeStatus: 'ok',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: { kinesiology_intake_completed_at: '2026-09-01T00:00:00.000Z' },
      usage: EMPTY_INTAKE_USAGE,
      probeStatus: 'ok',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: historyOnly,
      usage: EMPTY_INTAKE_USAGE,
      probeStatus: 'failed',
    }), false);
  });

  it('still walls a blank new invite after usage probe finds nothing', () => {
    const freshInvite = {
      full_name: '',
      onboarding_completed: false,
      height_cm: 0,
      weight_kg: 0,
      kinesiology_intake_completed_at: null,
      kinesiology_intake: emptyIntake(),
    };
    assert.equal(intakeGateNeedsUsageProbe({
      isCoachedClient: true,
      isCoach: false,
      profile: freshInvite,
    }), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: freshInvite,
      usage: EMPTY_INTAKE_USAGE,
      probeStatus: 'idle',
    }), false);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: false,
      profile: freshInvite,
      usage: EMPTY_INTAKE_USAGE,
      probeStatus: 'ok',
    }), true);
    assert.equal(shouldForceKinesiologyIntake({
      isCoachedClient: true,
      isCoach: true,
      profile: freshInvite,
      usage: EMPTY_INTAKE_USAGE,
      probeStatus: 'ok',
    }), false);
  });

  it('keeps the form exercise-type options including Autre', () => {
    assert.ok(TYPES_EXERCICES_OPTIONS.includes('Charges libres (haltères / barre)'));
    assert.ok(TYPES_EXERCICES_OPTIONS.includes('Peu importe je m\'adapte'));
    const intake = completeOriginal({
      typesExercices: ['Autre'],
      typesExercicesAutre: 'Natation',
    });
    assert.match(formatAnswer(intake, 'typesExercices'), /Natation/);
  });

  it('parses jsonb without dropping original keys', () => {
    const parsed = parseIntake({ nom: 'Petit', extras: { cardio: 'like' } });
    assert.equal(parsed.nom, 'Petit');
    assert.equal(parsed.objectifPrincipal, '');
    assert.equal(parsed.extras.cardio, 'like');
    assert.equal(parsed.version, 1);
  });
});

describe('kinesiologyIntake wiring', () => {
  it('does not replace Age with date of birth in the intake UI', () => {
    const flow = readFileSync(resolve(process.cwd(), 'src/components/onboarding/KinesiologyIntakeFlow.tsx'), 'utf8');
    assert.match(flow, /label\('age'\)/);
    assert.match(flow, /intake\.age/);
    assert.doesNotMatch(flow, /date_of_birth/);
    assert.doesNotMatch(flow, /dateOfBirth/);
    assert.match(flow, /objectifPrincipal/);
    assert.match(flow, /prefereProgramme/);
    assert.match(flow, /<TextArea value=\{intake\.objectifPrincipal\}/);
    assert.match(flow, /<TextArea value=\{intake\.prefereProgramme\}/);
    assert.doesNotMatch(flow, /extrasTitle/);
    assert.doesNotMatch(flow, /extrasHint/);
    assert.doesNotMatch(flow, /ScreenExtras/);
    assert.doesNotMatch(flow, /ScreenReste/);
    assert.match(flow, /deriveFoisParSemaine/);
    assert.match(flow, /prepareIntakeForSave/);
  });

  it('gates coached invite clients on this intake, not the tracker calorie onboarding', () => {
    const app = [
      readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/app/bootstrap/useAuthenticatedSession.ts'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/app/guards/RouteGuards.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/app/router/AppRoutes.tsx'), 'utf8'),
    ].join('\n');
    assert.match(app, /KinesiologyIntakeFlow/);
    assert.match(app, /shouldForceKinesiologyIntake/);
    assert.match(app, /intakeGateNeedsUsageProbe/);
    assert.match(app, /probeIntakeUsage/);
    assert.doesNotMatch(app, /coachedClient && !skipPersonalOnboarding && !isIntakeAlreadyFilled/);
    const finish = readFileSync(resolve(process.cwd(), 'src/components/onboarding/KinesiologyIntakeFlow.tsx'), 'utf8');
    assert.match(finish, /intakeToProfilePatch/);
    assert.match(finish, /stripSelfServeNutritionTargets\(patch, coached\)/);
    assert.match(finish, /allowExit/);
    assert.match(finish, /WallSignOut/);
    // Resume + solo targets (docs/VISION.md point 9): draft saved on every Continuer,
    // targets screen only for a solo first run, never for a coached client.
    assert.match(finish, /intakeResumeScreen\(/);
    assert.match(finish, /persistDraft\(intake\)/);
    assert.match(finish, /saveChain/);
    assert.match(finish, /draftState/);
    assert.match(finish, /showTargets = !coached && coachingRole !== 'coach' && !profile\?\.onboarding_completed/);
    assert.match(finish, /soloTargetsToProfilePatch\(targets\)/);
    assert.match(finish, /TARGETS_SCREEN_INDEX && <ScreenTargets/);
    assert.match(finish, /aria-checked/);
    assert.match(finish, /bg-blue-600 text-white/);
    assert.match(finish, /max-w-lg/);
    assert.match(finish, /mx-auto/);
    assert.doesNotMatch(finish, /from 'motion\/react'/);
    assert.doesNotMatch(finish, /AnimatePresence/);
    assert.doesNotMatch(finish, /burst=/);
    assert.match(app, /path="\/intake"/);
    assert.match(app, /animate-spin w-8 h-8 border-2 border-blue-500/);
    assert.doesNotMatch(app, /GymLoader/);
    const usage = readFileSync(resolve(process.cwd(), 'src/lib/kinesiologyIntakeUsage.ts'), 'utf8');
    assert.match(usage, /PROBE_TIMEOUT_MS/);
    assert.match(usage, /intake usage probe timeout/);

    const dashboard = readFileSync(resolve(process.cwd(), 'src/components/dashboard/Dashboard.tsx'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/dashboard/hooks/useDashboardBootstrap.ts'), 'utf8');
    assert.doesNotMatch(dashboard, /navigate\('\/intake'\)/);
    assert.doesNotMatch(dashboard, /intake\.completeLater/);

    const profile = readFileSync(resolve(process.cwd(), 'src/components/profile/ProfilePage.tsx'), 'utf8');
    assert.match(profile, /isIntakeAlreadyFilled/);
    assert.match(profile, /to="\/intake"/);

    const detail = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientDetailPage.tsx'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/coaching/hooks/useClientDossier.ts'), 'utf8');
    assert.match(detail, /KinesiologyIntakeReview/);
    assert.match(detail, /intake\.waiting/);

    const setup = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientSetupPage.tsx'), 'utf8');
    assert.match(setup, /KinesiologyIntakeReview/);
    assert.match(setup, /isIntakeAlreadyFilled/);
  });
});

describe('bilingual intake labels', () => {
  it('shows English labels for the canonical French stored values, and never changes what is stored', () => {
    assert.equal(intakeOptionLabel('Oui', true), 'Yes');
    assert.equal(intakeOptionLabel('Oui', false), 'Oui');
    assert.equal(intakeOptionLabel('Poids du corps seulement', true), 'Bodyweight only');
    assert.equal(intakeOptionLabel('Débutant (moins de 6-12 mois réguliers)', true), 'Beginner (less than 6–12 months of consistent training)');
    // Unknown / free text passes through untouched.
    assert.equal(intakeOptionLabel('Natation', true), 'Natation');
    // Every choice option has an English label.
    for (const v of [...OUI_NON, ...NIVEAU_OPTIONS, ...DUREE_OPTIONS, ...LIEU_OPTIONS, ...EQUIPEMENT_OPTIONS, ...TYPES_EXERCICES_OPTIONS, ...EXTRA_MEDS_OPTIONS, ...SEXE_OPTIONS]) {
      if (/^[0-9]/.test(v)) continue;
      assert.ok(hasIntakeOptionLabelEn(v), `missing EN label for ${v}`);
    }
  });

  it('formatAnswer follows the viewer language while the intake stays in French', () => {
    const intake = parseIntake(completeOriginal({
      equipement: ['Barre', 'Autre'],
      equipementAutre: 'TRX',
      lieu: 'Salle',
      douleursLimitations: 'Non',
    }));
    assert.equal(formatAnswer(intake, 'equipement', true), 'Barbell, Other: TRX');
    assert.equal(formatAnswer(intake, 'equipement'), 'Barre, Autre : TRX');
    assert.equal(formatAnswer(intake, 'lieu', true), 'Gym');
    assert.equal(formatAnswer(intake, 'douleursLimitations', true), 'No');
    assert.equal(intake.lieu, 'Salle');
  });
});

describe('intake joursDispo → program weekdays', () => {
  it('maps lun/dim to JS getDay ints and prefers those days when adding a session', () => {
    assert.equal(INTAKE_WEEKDAY_TO_JS.lun, 1);
    assert.equal(INTAKE_WEEKDAY_TO_JS.dim, 0);
    assert.deepEqual(intakeAvailableWeekdays({ extras: { joursDispo: ['lun', 'mer', 'ven'] } }), [1, 3, 5]);
    assert.deepEqual(intakeAvailableWeekdays({ extras: { joursDispo: ['dim', 'lun'] } }), [0, 1]);
    assert.deepEqual(intakeAvailableWeekdays({ extras: { joursDispo: [] } }), []);
    assert.equal(nextProgramWeekday([], [3, 5]), 3);
    assert.equal(nextProgramWeekday([3], [3, 5]), 5);
    assert.equal(nextProgramWeekday([3, 5], [3, 5]), 1);
    assert.equal(nextProgramWeekday([], []), 1);
  });

  it('Setup passes preferredWeekdays into the program editor', () => {
    const setup = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientSetupPage.tsx'), 'utf8');
    assert.match(setup, /preferredWeekdays=\{preferredWeekdays\}/);
    assert.match(setup, /intakeAvailableWeekdays/);
    const editor = readFileSync(resolve(process.cwd(), 'src/components/coaching/ProgramSessionEditor.tsx'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/programs/hooks/useProgramEditorTracking.ts'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/programs/hooks/useProgramNlEdit.ts'), 'utf8');
    assert.match(editor, /nextProgramWeekday\(days\.map\(d => d\.weekday\), preferredWeekdays\)/);
  });
});
