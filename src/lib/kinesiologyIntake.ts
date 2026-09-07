/** Original Google Form questionnaire. Labels here are the source of truth. */

import {
  calculateBMR,
  activityLevelFromTrainingAndOccupation,
  calculateCalorieTarget,
  calculateEnhancedTDEE,
  calculateMacros,
  calculateWaterTarget,
} from './utils';

export const INTAKE_VERSION = 1 as const;

export const ORIGINAL_LABELS_FR = {
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
} as const;

export type OriginalQuestionId = keyof typeof ORIGINAL_LABELS_FR;

export const ORIGINAL_QUESTION_IDS = Object.keys(ORIGINAL_LABELS_FR) as OriginalQuestionId[];

export const ORIGINAL_LABELS_EN: Record<OriginalQuestionId, string> = {
  nom: 'Last name',
  prenom: 'First name',
  age: 'Age',
  sexeGenre: 'Sex / gender',
  tailleCm: 'Height (cm)',
  poidsApproxKg: 'Approximate weight (kg)',
  objectifPrincipal: 'What is your main goal',
  depuisCombienDeTemps: 'How long have you been pursuing this goal?',
  niveauActuel: 'What is your current level?',
  foisParSemaine: 'How many times per week?',
  programmeStructure: 'Have you already followed a structured program?',
  seancesRealistes: 'How many sessions per week can you realistically do?',
  dureeIdeale: 'Ideal session length',
  lieu: 'Where do you mainly train?',
  equipement: 'Available equipment (multiple choices)',
  douleursLimitations: 'Do you currently have pain or limitations that affect your movement?',
  mouvementAEviter: 'Description of the movement to avoid (if yes)',
  blessuresChirurgies: 'Have you had any major injuries, surgeries, or operations?',
  descriptionBlessures: 'Description of the injury(ies) / surgery(ies) / operation(s) (if yes)',
  cardiaqueHtaPoitrine: 'Heart condition, uncontrolled hypertension, or chest pain during effort?',
  etourdissementsEquilibre: 'Dizziness, loss of balance, or unusual shortness of breath?',
  medecinLimiteExercices: 'Has a doctor ever recommended that you limit certain exercises?',
  conditionMedicalePrecise: 'Specific medical condition (if yes to any of the previous answers)',
  typesExercices: 'Which types of exercises do you prefer?',
  exercicesDetestes: 'Any exercises you hate or absolutely want to avoid?',
  prefereProgramme: 'Do you prefer a program?',
  quelqueChoseImportant: 'Is there anything important I should absolutely know?',
};

export const SEXE_OPTIONS = ['F', 'H', 'Autre'] as const;
export const OUI_NON = ['Oui', 'Non'] as const;
export const NIVEAU_OPTIONS = [
  'Débutant (moins de 6-12 mois réguliers)',
  'Intermédiaire',
  'Avancé',
] as const;
export const FOIS_PAR_SEMAINE_OPTIONS = ['1-2', '3-4', '5-6', '7+'] as const;
export const DUREE_OPTIONS = ['30 mins', '45-60 mins', '60-75 mins', '90+ mins'] as const;
export const LIEU_OPTIONS = ['Domicile', 'Salle', 'Mixte', 'Extérieur'] as const;
export const EQUIPEMENT_OPTIONS = [
  'Haltères libres',
  'Barre',
  'Rack',
  'Banc',
  'Machines',
  'Câbles',
  'Bandes élastiques',
  'Kettlebells',
  'Barre de traction',
  'Vélo intérieur',
  'Tapis',
  'Rameur',
  'Appareil à squat',
  'Poids du corps seulement',
  'Autre',
] as const;
export const TYPES_EXERCICES_OPTIONS = [
  'Charges libres (haltères / barre)',
  'Machines',
  'Poids du corps',
  'Unilatéral / Stabilité',
  'Circuits / Plus dynamique',
  'Peu importe je m\'adapte',
  'Autre',
] as const;

/**
 * Structured goal next to the free-text « objectif principal ». Values match GOALS in
 * constants.ts so the answer maps straight to user_profiles.goal (ISSN calc + agent).
 */
export const EXTRA_OBJECTIF_OPTIONS = [
  { value: 'cut', labelFr: 'Perdre du gras', labelEn: 'Lose fat' },
  { value: 'maintain', labelFr: 'Maintien / santé', labelEn: 'Maintain / health' },
  { value: 'bulk', labelFr: 'Prendre du muscle', labelEn: 'Build muscle' },
] as const;

export type IntakeObjectifType = typeof EXTRA_OBJECTIF_OPTIONS[number]['value'];

export const EXTRA_OCCUPATION_OPTIONS = [
  { value: 'sitting', labelFr: 'Surtout assis', labelEn: 'Mostly sitting' },
  { value: 'standing', labelFr: 'Surtout sur pieds', labelEn: 'Mostly on your feet' },
  { value: 'physical', labelFr: 'Physique', labelEn: 'Physical work' },
] as const;

export const EXTRA_SLEEP_OPTIONS = [
  { value: 'under_6', labelFr: '<6 h', labelEn: '<6 h' },
  { value: '6_7', labelFr: '6–7 h', labelEn: '6–7 h' },
  { value: '7_8', labelFr: '7–8 h', labelEn: '7–8 h' },
  { value: '8_plus', labelFr: '8+ h', labelEn: '8+ h' },
] as const;

export const EXTRA_CARDIO_OPTIONS = [
  { value: 'like', labelFr: 'J’aime', labelEn: 'I like it' },
  { value: 'tolerate', labelFr: 'Je tolère', labelEn: 'I tolerate it' },
  { value: 'avoid', labelFr: 'J’évite', labelEn: 'I avoid it' },
] as const;

export const EXTRA_MEDS_OPTIONS = ['Oui', 'Non', 'Je ne sais pas'] as const;
export const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;

/** JS getDay() ints (0 = Sunday). Same mapping as coach-agent compactIntake. */
export const INTAKE_WEEKDAY_TO_JS: Record<(typeof WEEKDAYS)[number], number> = {
  dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
};

/** Monday-first order used by the program editor. */
export const PROGRAM_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function intakeAvailableWeekdays(raw: unknown): number[] {
  const days = parseIntake(raw).extras.joursDispo
    .map(code => INTAKE_WEEKDAY_TO_JS[code as (typeof WEEKDAYS)[number]])
    .filter((n): n is number => typeof n === 'number');
  return [...new Set(days)];
}

export function nextProgramWeekday(used: number[], preferred: number[] = []): number {
  const taken = new Set(used);
  const pool = preferred.length > 0 ? preferred : [...PROGRAM_WEEKDAY_ORDER];
  const fromPool = pool.find(d => !taken.has(d));
  if (fromPool != null) return fromPool;
  return PROGRAM_WEEKDAY_ORDER.find(d => !taken.has(d)) ?? (used.length % 7);
}

/**
 * The French strings above are the *stored* values (the Google Form legacy — the database,
 * the coach agent and the medical-flag checks all compare against them). The UI shows them
 * through `intakeOptionLabel`, which maps to English when the viewer's language is English.
 */
const INTAKE_OPTION_LABELS_EN: Record<string, string> = {
  F: 'F',
  H: 'M',
  Autre: 'Other',
  Oui: 'Yes',
  Non: 'No',
  'Je ne sais pas': "I don't know",
  'Débutant (moins de 6-12 mois réguliers)': 'Beginner (less than 6–12 months of consistent training)',
  Intermédiaire: 'Intermediate',
  Avancé: 'Advanced',
  '30 mins': '30 min',
  '45-60 mins': '45–60 min',
  '60-75 mins': '60–75 min',
  '90+ mins': '90+ min',
  Domicile: 'Home',
  Salle: 'Gym',
  Mixte: 'Both',
  Extérieur: 'Outdoors',
  'Haltères libres': 'Dumbbells',
  Barre: 'Barbell',
  Rack: 'Rack',
  Banc: 'Bench',
  Machines: 'Machines',
  Câbles: 'Cables',
  'Bandes élastiques': 'Resistance bands',
  Kettlebells: 'Kettlebells',
  'Barre de traction': 'Pull-up bar',
  'Vélo intérieur': 'Indoor bike',
  Tapis: 'Treadmill',
  Rameur: 'Rower',
  'Appareil à squat': 'Squat machine',
  'Poids du corps seulement': 'Bodyweight only',
  'Charges libres (haltères / barre)': 'Free weights (dumbbells / barbell)',
  'Poids du corps': 'Bodyweight',
  'Unilatéral / Stabilité': 'Unilateral / stability',
  'Circuits / Plus dynamique': 'Circuits / more dynamic',
  "Peu importe je m'adapte": "Doesn't matter, I adapt",
};

export function intakeOptionLabel(value: string, en: boolean): string {
  if (!en) return value;
  return INTAKE_OPTION_LABELS_EN[value] ?? value;
}

/** Test hook: is this stored value covered by the English dictionary? */
export function hasIntakeOptionLabelEn(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTAKE_OPTION_LABELS_EN, value);
}

export interface IntakeExtras {
  objectifType: string;
  poidsViseKg: string;
  occupation: string;
  dateCible: string;
  pourquoiMaintenant: string;
  joursDispo: string[];
  douleurOu: string;
  douleurIntensite: string;
  douleurDepuis: string;
  physioEnCours: string;
  blessureAnnee: string;
  blessureSuivi: string;
  medicamentsEffort: string;
  grossessePostpartumTraitement: string;
  sommeil: string;
  cardio: string;
}

export interface KinesiologyIntake {
  version: typeof INTAKE_VERSION;
  nom: string;
  prenom: string;
  age: string;
  sexeGenre: string;
  tailleCm: string;
  poidsApproxKg: string;
  objectifPrincipal: string;
  depuisCombienDeTemps: string;
  niveauActuel: string;
  foisParSemaine: string;
  programmeStructure: string;
  seancesRealistes: string;
  dureeIdeale: string;
  lieu: string;
  equipement: string[];
  equipementAutre: string;
  douleursLimitations: string;
  mouvementAEviter: string;
  blessuresChirurgies: string;
  descriptionBlessures: string;
  cardiaqueHtaPoitrine: string;
  etourdissementsEquilibre: string;
  medecinLimiteExercices: string;
  conditionMedicalePrecise: string;
  typesExercices: string[];
  typesExercicesAutre: string;
  exercicesDetestes: string;
  prefereProgramme: string;
  quelqueChoseImportant: string;
  extras: IntakeExtras;
}

/** Content screens 0–6 (extras live on those screens). Solo then sees computed targets. */
export const TOTAL_INTAKE_SCREENS = 7;
/** Solo only: shown after the last content screen, computes kcal / macros from the answers. */
export const TARGETS_SCREEN_INDEX = 7;

export function emptyIntakeExtras(): IntakeExtras {
  return {
    objectifType: '',
    poidsViseKg: '',
    occupation: '',
    dateCible: '',
    pourquoiMaintenant: '',
    joursDispo: [],
    douleurOu: '',
    douleurIntensite: '',
    douleurDepuis: '',
    physioEnCours: '',
    blessureAnnee: '',
    blessureSuivi: '',
    medicamentsEffort: '',
    grossessePostpartumTraitement: '',
    sommeil: '',
    cardio: '',
  };
}

export function emptyIntake(): KinesiologyIntake {
  return {
    version: INTAKE_VERSION,
    nom: '',
    prenom: '',
    age: '',
    sexeGenre: '',
    tailleCm: '',
    poidsApproxKg: '',
    objectifPrincipal: '',
    depuisCombienDeTemps: '',
    niveauActuel: '',
    foisParSemaine: '',
    programmeStructure: '',
    seancesRealistes: '',
    dureeIdeale: '',
    lieu: '',
    equipement: [],
    equipementAutre: '',
    douleursLimitations: '',
    mouvementAEviter: '',
    blessuresChirurgies: '',
    descriptionBlessures: '',
    cardiaqueHtaPoitrine: '',
    etourdissementsEquilibre: '',
    medecinLimiteExercices: '',
    conditionMedicalePrecise: '',
    typesExercices: [],
    typesExercicesAutre: '',
    exercicesDetestes: '',
    prefereProgramme: '',
    quelqueChoseImportant: '',
    extras: emptyIntakeExtras(),
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

export function parseIntake(raw: unknown): KinesiologyIntake {
  const base = emptyIntake();
  if (!raw || typeof raw !== 'object') return base;
  const row = raw as Record<string, unknown>;
  const extrasRaw = row.extras && typeof row.extras === 'object'
    ? row.extras as Record<string, unknown>
    : {};
  return {
    ...base,
    nom: asString(row.nom),
    prenom: asString(row.prenom),
    age: asString(row.age),
    sexeGenre: asString(row.sexeGenre),
    tailleCm: asString(row.tailleCm),
    poidsApproxKg: asString(row.poidsApproxKg),
    objectifPrincipal: asString(row.objectifPrincipal),
    depuisCombienDeTemps: asString(row.depuisCombienDeTemps),
    niveauActuel: asString(row.niveauActuel),
    foisParSemaine: asString(row.foisParSemaine),
    programmeStructure: asString(row.programmeStructure),
    seancesRealistes: asString(row.seancesRealistes),
    dureeIdeale: asString(row.dureeIdeale),
    lieu: asString(row.lieu),
    equipement: asStringArray(row.equipement),
    equipementAutre: asString(row.equipementAutre),
    douleursLimitations: asString(row.douleursLimitations),
    mouvementAEviter: asString(row.mouvementAEviter),
    blessuresChirurgies: asString(row.blessuresChirurgies),
    descriptionBlessures: asString(row.descriptionBlessures),
    cardiaqueHtaPoitrine: asString(row.cardiaqueHtaPoitrine),
    etourdissementsEquilibre: asString(row.etourdissementsEquilibre),
    medecinLimiteExercices: asString(row.medecinLimiteExercices),
    conditionMedicalePrecise: asString(row.conditionMedicalePrecise),
    typesExercices: asStringArray(row.typesExercices),
    typesExercicesAutre: asString(row.typesExercicesAutre),
    exercicesDetestes: asString(row.exercicesDetestes),
    prefereProgramme: asString(row.prefereProgramme),
    quelqueChoseImportant: asString(row.quelqueChoseImportant),
    extras: {
      ...emptyIntakeExtras(),
      objectifType: asString(extrasRaw.objectifType),
      poidsViseKg: asString(extrasRaw.poidsViseKg),
      occupation: asString(extrasRaw.occupation),
      dateCible: asString(extrasRaw.dateCible),
      pourquoiMaintenant: asString(extrasRaw.pourquoiMaintenant),
      joursDispo: asStringArray(extrasRaw.joursDispo),
      douleurOu: asString(extrasRaw.douleurOu),
      douleurIntensite: asString(extrasRaw.douleurIntensite),
      douleurDepuis: asString(extrasRaw.douleurDepuis),
      physioEnCours: asString(extrasRaw.physioEnCours),
      blessureAnnee: asString(extrasRaw.blessureAnnee),
      blessureSuivi: asString(extrasRaw.blessureSuivi),
      medicamentsEffort: asString(extrasRaw.medicamentsEffort),
      grossessePostpartumTraitement: asString(extrasRaw.grossessePostpartumTraitement),
      sommeil: asString(extrasRaw.sommeil),
      cardio: asString(extrasRaw.cardio),
    },
  };
}

function filled(value: string): boolean {
  return value.trim().length > 0;
}

function positiveNumber(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}

/** PAR-Q-style screening questions. A « Oui » on any of them is a medical flag for the coach. */
export const MEDICAL_FLAG_IDS = [
  'cardiaqueHtaPoitrine',
  'etourdissementsEquilibre',
  'medecinLimiteExercices',
] as const satisfies readonly OriginalQuestionId[];

export function medicalFlagIds(intake: KinesiologyIntake): OriginalQuestionId[] {
  return MEDICAL_FLAG_IDS.filter(id => intake[id] === 'Oui');
}

export function medicalYesFlags(intake: KinesiologyIntake): boolean {
  return medicalFlagIds(intake).length > 0;
}

/** For roster rows / 360 headers that only hold the raw jsonb. */
export function profileHasMedicalFlags(raw: unknown): boolean {
  return medicalYesFlags(parseIntake(raw));
}

export function isIntakeObjectifType(value: string): value is IntakeObjectifType {
  return EXTRA_OBJECTIF_OPTIONS.some(o => o.value === value);
}

/**
 * Maps realistic weekly sessions onto the original « fois par semaine » bands so the 27-question
 * jsonb stays populated without asking the same thing twice.
 */
export function deriveFoisParSemaine(seancesRealistes: string): string {
  const n = Number(seancesRealistes);
  if (!Number.isFinite(n) || n < 1) return '';
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  if (n <= 6) return '5-6';
  return '7+';
}

/** Fill derived / default original fields before persist. Stored values stay French. */
export function prepareIntakeForSave(intake: KinesiologyIntake): KinesiologyIntake {
  const derived = deriveFoisParSemaine(intake.seancesRealistes);
  let objectifPrincipal = intake.objectifPrincipal;
  if (!filled(objectifPrincipal) && isIntakeObjectifType(intake.extras.objectifType)) {
    const opt = EXTRA_OBJECTIF_OPTIONS.find(o => o.value === intake.extras.objectifType);
    if (opt) objectifPrincipal = opt.labelFr;
  }
  return {
    ...intake,
    objectifPrincipal,
    foisParSemaine: derived || intake.foisParSemaine,
  };
}

export function originalAnswersComplete(intake: KinesiologyIntake): boolean {
  if (!filled(intake.nom) || !filled(intake.prenom)) return false;
  if (!positiveNumber(intake.age, 10, 99)) return false;
  if (!filled(intake.sexeGenre)) return false;
  if (!positiveNumber(intake.tailleCm, 100, 250)) return false;
  if (!positiveNumber(intake.poidsApproxKg, 30, 300)) return false;
  if (!isIntakeObjectifType(intake.extras.objectifType)) return false;
  if (!filled(intake.niveauActuel)) return false;
  if (!positiveNumber(intake.seancesRealistes, 1, 14)) return false;
  if (!filled(intake.dureeIdeale) || !filled(intake.lieu)) return false;
  if (intake.equipement.length === 0) return false;
  if (intake.equipement.includes('Autre') && !filled(intake.equipementAutre)) return false;
  if (intake.douleursLimitations !== 'Oui' && intake.douleursLimitations !== 'Non') return false;
  if (intake.douleursLimitations === 'Oui' && !filled(intake.mouvementAEviter)) return false;
  if (intake.blessuresChirurgies !== 'Oui' && intake.blessuresChirurgies !== 'Non') return false;
  if (intake.blessuresChirurgies === 'Oui' && !filled(intake.descriptionBlessures)) return false;
  if (intake.cardiaqueHtaPoitrine !== 'Oui' && intake.cardiaqueHtaPoitrine !== 'Non') return false;
  if (intake.etourdissementsEquilibre !== 'Oui' && intake.etourdissementsEquilibre !== 'Non') return false;
  if (intake.medecinLimiteExercices !== 'Oui' && intake.medecinLimiteExercices !== 'Non') return false;
  if (medicalYesFlags(intake) && !filled(intake.conditionMedicalePrecise)) return false;
  if (intake.typesExercices.length === 0) return false;
  if (intake.typesExercices.includes('Autre') && !filled(intake.typesExercicesAutre)) return false;
  return true;
}

export function screenCanProceed(intake: KinesiologyIntake, screen: number): boolean {
  switch (screen) {
    case 0:
      return filled(intake.nom) && filled(intake.prenom)
        && positiveNumber(intake.age, 10, 99)
        && filled(intake.sexeGenre)
        && positiveNumber(intake.tailleCm, 100, 250)
        && positiveNumber(intake.poidsApproxKg, 30, 300);
    case 1:
      return isIntakeObjectifType(intake.extras.objectifType);
    case 2:
      return filled(intake.niveauActuel)
        && positiveNumber(intake.seancesRealistes, 1, 14)
        && filled(intake.dureeIdeale);
    case 3:
      return filled(intake.lieu) && intake.equipement.length > 0
        && (!intake.equipement.includes('Autre') || filled(intake.equipementAutre));
    case 4:
      return (intake.douleursLimitations === 'Oui' || intake.douleursLimitations === 'Non')
        && (intake.douleursLimitations === 'Non' || filled(intake.mouvementAEviter));
    case 5:
      return (intake.blessuresChirurgies === 'Oui' || intake.blessuresChirurgies === 'Non')
        && (intake.blessuresChirurgies === 'Non' || filled(intake.descriptionBlessures))
        && (intake.cardiaqueHtaPoitrine === 'Oui' || intake.cardiaqueHtaPoitrine === 'Non')
        && (intake.etourdissementsEquilibre === 'Oui' || intake.etourdissementsEquilibre === 'Non')
        && (intake.medecinLimiteExercices === 'Oui' || intake.medecinLimiteExercices === 'Non')
        && (!medicalYesFlags(intake) || filled(intake.conditionMedicalePrecise));
    case 6:
      return intake.typesExercices.length > 0
        && (!intake.typesExercices.includes('Autre') || filled(intake.typesExercicesAutre));
    default:
      return false;
  }
}

/**
 * Only `kinesiology_intake_completed_at` counts. Answers are saved screen by screen so the
 * client can resume; a jsonb with every original answer filled is still a draft until submit.
 */
export function isIntakeAlreadyFilled(profile: {
  kinesiology_intake_completed_at?: string | null;
  kinesiology_intake?: unknown;
} | null | undefined): boolean {
  return !!profile?.kinesiology_intake_completed_at;
}

/**
 * Where a saved draft resumes: the first content screen that cannot proceed yet, otherwise the
 * last content screen (prefs — optional free text lives there).
 */
export function intakeResumeScreen(intake: KinesiologyIntake): number {
  for (let screen = 0; screen < TOTAL_INTAKE_SCREENS; screen++) {
    if (!screenCanProceed(intake, screen)) return screen;
  }
  return TOTAL_INTAKE_SCREENS - 1;
}

export interface SoloIntakeTargets {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
  goal: IntakeObjectifType;
  activity_level: string;
}

function intakeActivityLevel(sessions: number, occupation: string): string {
  return activityLevelFromTrainingAndOccupation(sessions, occupation);
}

/**
 * Solo copilot, first step: the same Mifflin-St Jeor + activity + goal + ISSN protein formula
 * as the tracker onboarding, fed by the intake answers. Coached clients never get this — their
 * coach decides (docs/VISION.md, point 5).
 */
export function soloTargetsFromIntake(intake: KinesiologyIntake): SoloIntakeTargets | null {
  const weight = Number(intake.poidsApproxKg);
  const height = Number(intake.tailleCm);
  const age = Number(intake.age);
  if (!positiveNumber(intake.poidsApproxKg, 30, 300)) return null;
  if (!positiveNumber(intake.tailleCm, 100, 250)) return null;
  if (!positiveNumber(intake.age, 10, 99)) return null;

  const goal: IntakeObjectifType = isIntakeObjectifType(intake.extras.objectifType)
    ? intake.extras.objectifType
    : 'maintain';
  const sessions = positiveNumber(intake.seancesRealistes, 0, 14) ? Number(intake.seancesRealistes) : 3;
  const activity = intakeActivityLevel(sessions, intake.extras.occupation);

  // Mifflin-St Jeor only has two formulas; « Autre » takes the midpoint.
  const bmr = intake.sexeGenre === 'F'
    ? calculateBMR(weight, height, age, 'female')
    : intake.sexeGenre === 'H'
      ? calculateBMR(weight, height, age, 'male')
      : Math.round((calculateBMR(weight, height, age, 'female') + calculateBMR(weight, height, age, 'male')) / 2);
  // Steps are unknown at intake time: 5000 is the neutral value of the NEAT bonus.
  const tdee = calculateEnhancedTDEE(bmr, activity, 5000, sessions);
  const calories = calculateCalorieTarget(tdee, goal, bmr);
  const macros = calculateMacros(calories, goal, 'omnivore', weight);
  const water = calculateWaterTarget(weight, 5000, activity, 'average');

  return {
    bmr: Math.round(bmr),
    tdee,
    calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    water_ml: water,
    goal,
    activity_level: activity,
  };
}

export function soloTargetsToProfilePatch(targets: SoloIntakeTargets): Record<string, unknown> {
  return {
    daily_calorie_target: targets.calories,
    protein_target: targets.protein,
    carbs_target: targets.carbs,
    fat_target: targets.fat,
    daily_water_target_ml: targets.water_ml,
    activity_level: targets.activity_level,
    goal: targets.goal,
  };
}

/** Profile fields used to decide whether the 27-question wall may block the app. */
export type IntakeProfileSlice = {
  kinesiology_intake_completed_at?: string | null;
  kinesiology_intake?: unknown;
  onboarding_completed?: boolean | null;
  full_name?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  date_of_birth?: string | null;
  gender?: string | null;
};

export type IntakeUsageSignals = {
  hasWorkout: boolean;
  hasNutrition: boolean;
  hasCheckIn: boolean;
  hasWeight: boolean;
};

export const EMPTY_INTAKE_USAGE: IntakeUsageSignals = {
  hasWorkout: false,
  hasNutrition: false,
  hasCheckIn: false,
  hasWeight: false,
};

export type IntakeProbeStatus = 'idle' | 'pending' | 'ok' | 'failed';

function positiveMetric(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function filledText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Tracker profile already in use — not a blank new invite. */
export function profileShowsExistingAppUse(profile: IntakeProfileSlice | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed) return true;
  if (positiveMetric(profile.height_cm) && positiveMetric(profile.weight_kg)) return true;
  if (
    filledText(profile.full_name)
    && filledText(profile.gender)
    && (positiveMetric(profile.height_cm) || positiveMetric(profile.weight_kg) || filledText(profile.date_of_birth))
  ) {
    return true;
  }
  return false;
}

export function usageShowsExistingAppUse(usage: IntakeUsageSignals | null | undefined): boolean {
  if (!usage) return false;
  return usage.hasWorkout || usage.hasNutrition || usage.hasCheckIn || usage.hasWeight;
}

export function shouldSkipKinesiologyIntake(
  profile: IntakeProfileSlice | null | undefined,
  usage?: IntakeUsageSignals | null,
): boolean {
  return isIntakeAlreadyFilled(profile)
    || profileShowsExistingAppUse(profile)
    || usageShowsExistingAppUse(usage);
}

export type IntakeGateInput = {
  isCoachedClient: boolean;
  isCoach: boolean;
  profile: IntakeProfileSlice | null | undefined;
  usage: IntakeUsageSignals | null;
  probeStatus: IntakeProbeStatus;
};

/**
 * Hard wall for a new account with no completed intake and no app history.
 * - Coached invite: only when the usage probe answered (fail-open — never block a client
 *   whose history could not be read).
 * - Solo: also when the probe failed — the alternative would be the tracker onboarding wall
 *   anyway, and the intake IS the solo onboarding (docs/VISION.md, point 9).
 * - Coach: never.
 */
export function shouldForceKinesiologyIntake(input: IntakeGateInput): boolean {
  if (input.isCoach) return false;
  if (shouldSkipKinesiologyIntake(input.profile, input.usage)) return false;
  if (input.isCoachedClient) return input.probeStatus === 'ok';
  return input.probeStatus === 'ok' || input.probeStatus === 'failed';
}

export function intakeGateNeedsUsageProbe(input: {
  isCoachedClient: boolean;
  isCoach: boolean;
  profile: IntakeProfileSlice | null | undefined;
}): boolean {
  if (input.isCoach) return false;
  if (shouldSkipKinesiologyIntake(input.profile, null)) return false;
  return true;
}

const NUTRITION_KEYS = [
  'daily_calorie_target',
  'protein_target',
  'carbs_target',
  'fat_target',
] as const;

export function intakeToProfilePatch(raw: KinesiologyIntake, completedAt: string): Record<string, unknown> {
  const intake = prepareIntakeForSave(raw);
  const height = Number(intake.tailleCm);
  const weight = Number(intake.poidsApproxKg);
  const sessions = Number(intake.seancesRealistes);
  const gender = intake.sexeGenre === 'F' ? 'female' : intake.sexeGenre === 'H' ? 'male' : 'other';
  const injuries = [
    intake.douleursLimitations === 'Oui' ? `Douleurs : ${intake.mouvementAEviter}` : '',
    intake.blessuresChirurgies === 'Oui' ? `Blessures : ${intake.descriptionBlessures}` : '',
    intake.conditionMedicalePrecise.trim(),
  ].filter(Boolean).join('\n');

  const extras = intake.extras;
  const target = extras.poidsViseKg.trim() ? Number(extras.poidsViseKg) : null;
  const activity = Number.isFinite(sessions)
    ? activityLevelFromTrainingAndOccupation(sessions, extras.occupation || undefined)
    : extras.occupation === 'sitting' ? 'sedentary'
      : extras.occupation === 'standing' ? 'light'
      : extras.occupation === 'physical' ? 'active'
      : null;
  const sleep = extras.sommeil === 'under_6' ? 5.5
    : extras.sommeil === '6_7' ? 6.5
    : extras.sommeil === '7_8' ? 7.5
    : extras.sommeil === '8_plus' ? 8.5
    : null;

  const patch: Record<string, unknown> = {
    full_name: `${intake.prenom.trim()} ${intake.nom.trim()}`.trim(),
    gender,
    height_cm: height,
    weight_kg: weight,
    training_frequency: Number.isFinite(sessions) ? sessions : undefined,
    injuries_limitations: injuries,
    kinesiology_intake: intake,
    kinesiology_intake_completed_at: completedAt,
    onboarding_completed: true,
  };
  if (target != null && Number.isFinite(target) && target >= 30 && target <= 300) {
    patch.target_weight_kg = target;
  }
  if (isIntakeObjectifType(extras.objectifType)) patch.goal = extras.objectifType;
  if (activity) patch.activity_level = activity;
  if (sleep != null) patch.sleep_hours_average = sleep;

  for (const key of NUTRITION_KEYS) {
    delete patch[key];
  }
  return patch;
}

const CHOICE_QUESTION_IDS: ReadonlySet<OriginalQuestionId> = new Set<OriginalQuestionId>([
  'sexeGenre', 'niveauActuel', 'foisParSemaine', 'programmeStructure', 'dureeIdeale', 'lieu',
  'douleursLimitations', 'blessuresChirurgies', 'cardiaqueHtaPoitrine', 'etourdissementsEquilibre',
  'medecinLimiteExercices',
]);

function formatMulti(items: readonly string[], extra: string, en: boolean): string {
  const other = intakeOptionLabel('Autre', en);
  return items
    .map(v => (v === 'Autre' && extra ? `${other}${en ? ': ' : ' : '}${extra}` : intakeOptionLabel(v, en)))
    .join(', ');
}

export function formatAnswer(intake: KinesiologyIntake, id: OriginalQuestionId, en = false): string {
  switch (id) {
    case 'equipement':
      return formatMulti(intake.equipement, intake.equipementAutre.trim(), en);
    case 'typesExercices':
      return formatMulti(intake.typesExercices, intake.typesExercicesAutre.trim(), en);
    default: {
      const value = intake[id];
      if (typeof value !== 'string') return '';
      return CHOICE_QUESTION_IDS.has(id) ? intakeOptionLabel(value, en) : value;
    }
  }
}
