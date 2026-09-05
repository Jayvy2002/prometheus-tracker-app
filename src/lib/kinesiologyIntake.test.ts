import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EMPTY_INTAKE_USAGE,
  ORIGINAL_LABELS_FR,
  ORIGINAL_QUESTION_IDS,
  emptyIntake,
  formatAnswer,
  intakeGateNeedsUsageProbe,
  intakeToProfilePatch,
  isIntakeAlreadyFilled,
  originalAnswersComplete,
  parseIntake,
  profileShowsExistingAppUse,
  screenCanProceed,
  shouldForceKinesiologyIntake,
  shouldSkipKinesiologyIntake,
  TYPES_EXERCICES_OPTIONS,
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
      extras: { ...emptyIntake().extras, poidsViseKg: '58' },
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

  it('requires original screens and conditional descriptions', () => {
    const blank = emptyIntake();
    assert.equal(screenCanProceed(blank, 0), false);
    assert.equal(originalAnswersComplete(blank), false);

    const ready = completeOriginal();
    assert.equal(screenCanProceed(ready, 0), true);
    assert.equal(screenCanProceed(ready, 7), true);
    assert.equal(originalAnswersComplete(ready), true);

    const pain = completeOriginal({ douleursLimitations: 'Oui', mouvementAEviter: '' });
    assert.equal(screenCanProceed(pain, 4), false);
    pain.mouvementAEviter = 'Pas de overhead';
    assert.equal(screenCanProceed(pain, 4), true);

    const heart = completeOriginal({ cardiaqueHtaPoitrine: 'Oui', conditionMedicalePrecise: '' });
    assert.equal(screenCanProceed(heart, 5), false);
    heart.conditionMedicalePrecise = 'HTA suivie';
    assert.equal(screenCanProceed(heart, 5), true);
  });

  it('skips when already completed', () => {
    assert.equal(isIntakeAlreadyFilled(null), false);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake_completed_at: '2026-09-01' }), true);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake: completeOriginal() }), true);
    assert.equal(isIntakeAlreadyFilled({ kinesiology_intake: emptyIntake() }), false);
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
  });

  it('gates coached invite clients on this intake, not the tracker calorie onboarding', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.match(app, /KinesiologyIntakeFlow/);
    assert.match(app, /shouldForceKinesiologyIntake/);
    assert.match(app, /intakeGateNeedsUsageProbe/);
    assert.match(app, /probeIntakeUsage/);
    assert.doesNotMatch(app, /coachedClient && !skipPersonalOnboarding && !isIntakeAlreadyFilled/);
    const finish = readFileSync(resolve(process.cwd(), 'src/components/onboarding/KinesiologyIntakeFlow.tsx'), 'utf8');
    assert.match(finish, /intakeToProfilePatch/);
    assert.match(finish, /stripSelfServeNutritionTargets/);
    assert.match(finish, /allowExit/);
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

    const dashboard = readFileSync(resolve(process.cwd(), 'src/components/dashboard/Dashboard.tsx'), 'utf8');
    assert.match(dashboard, /isIntakeAlreadyFilled/);
    assert.match(dashboard, /navigate\('\/intake'\)/);
    assert.match(dashboard, /intake\.completeLater/);

    const profile = readFileSync(resolve(process.cwd(), 'src/components/profile/ProfilePage.tsx'), 'utf8');
    assert.match(profile, /isIntakeAlreadyFilled/);
    assert.match(profile, /navigate\('\/intake'\)/);

    const detail = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientDetailPage.tsx'), 'utf8');
    assert.match(detail, /KinesiologyIntakeReview/);
    assert.match(detail, /intake\.waiting/);

    const setup = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientSetupPage.tsx'), 'utf8');
    assert.match(setup, /KinesiologyIntakeReview/);
    assert.match(setup, /isIntakeAlreadyFilled/);
  });
});
