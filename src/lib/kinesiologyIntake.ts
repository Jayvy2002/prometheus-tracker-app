/** Original Google Form questionnaire. Labels here are the source of truth. */

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

export interface IntakeExtras {
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

export const TOTAL_INTAKE_SCREENS = 9;
export const EXTRA_SCREEN_INDEX = 8;

export function emptyIntakeExtras(): IntakeExtras {
  return {
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

export function medicalYesFlags(intake: KinesiologyIntake): boolean {
  return intake.cardiaqueHtaPoitrine === 'Oui'
    || intake.etourdissementsEquilibre === 'Oui'
    || intake.medecinLimiteExercices === 'Oui';
}

export function originalAnswersComplete(intake: KinesiologyIntake): boolean {
  if (!filled(intake.nom) || !filled(intake.prenom)) return false;
  if (!positiveNumber(intake.age, 10, 99)) return false;
  if (!filled(intake.sexeGenre)) return false;
  if (!positiveNumber(intake.tailleCm, 100, 250)) return false;
  if (!positiveNumber(intake.poidsApproxKg, 30, 300)) return false;
  if (!filled(intake.objectifPrincipal) || !filled(intake.depuisCombienDeTemps)) return false;
  if (!filled(intake.niveauActuel) || !filled(intake.foisParSemaine)) return false;
  if (intake.programmeStructure !== 'Oui' && intake.programmeStructure !== 'Non') return false;
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
  if (!filled(intake.prefereProgramme)) return false;
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
      return filled(intake.objectifPrincipal) && filled(intake.depuisCombienDeTemps);
    case 2:
      return filled(intake.niveauActuel) && filled(intake.foisParSemaine)
        && (intake.programmeStructure === 'Oui' || intake.programmeStructure === 'Non')
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
        && (!intake.typesExercices.includes('Autre') || filled(intake.typesExercicesAutre))
        && filled(intake.prefereProgramme);
    case 7:
      return true;
    case 8:
      return true;
    default:
      return false;
  }
}

export function isIntakeAlreadyFilled(profile: {
  kinesiology_intake_completed_at?: string | null;
  kinesiology_intake?: unknown;
} | null | undefined): boolean {
  if (!profile) return false;
  if (profile.kinesiology_intake_completed_at) return true;
  return originalAnswersComplete(parseIntake(profile.kinesiology_intake));
}

const NUTRITION_KEYS = [
  'daily_calorie_target',
  'protein_target',
  'carbs_target',
  'fat_target',
] as const;

export function intakeToProfilePatch(intake: KinesiologyIntake, completedAt: string): Record<string, unknown> {
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
  const activity = extras.occupation === 'sitting' ? 'sedentary'
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
  if (activity) patch.activity_level = activity;
  if (sleep != null) patch.sleep_hours_average = sleep;

  for (const key of NUTRITION_KEYS) {
    delete patch[key];
  }
  return patch;
}

export function formatAnswer(intake: KinesiologyIntake, id: OriginalQuestionId): string {
  switch (id) {
    case 'equipement': {
      const extra = intake.equipementAutre.trim();
      const items = [...intake.equipement];
      if (items.includes('Autre') && extra) {
        return items.map(v => v === 'Autre' ? `Autre : ${extra}` : v).join(', ');
      }
      return items.join(', ');
    }
    case 'typesExercices': {
      const extra = intake.typesExercicesAutre.trim();
      const items = [...intake.typesExercices];
      if (items.includes('Autre') && extra) {
        return items.map(v => v === 'Autre' ? `Autre : ${extra}` : v).join(', ');
      }
      return items.join(', ');
    }
    default: {
      const value = intake[id];
      return typeof value === 'string' ? value : '';
    }
  }
}
