import { UserProfile, WeeklyMetrics, CoachingCategory, CoachingPriority } from './types';

export interface CoachingDecision {
  category: CoachingCategory;
  priority: CoachingPriority;
  phase: string;
  decision: string;
  reasoning: string;
  calorieAdjustment: number;
  cardioRecommendation: string | null;
  trainingRecommendation: string | null;
  lifestyleRecommendation: string | null;
}

interface WeightTrendData {
  currentWeekAvg: number | null;
  previousWeekAvg: number | null;
  twoWeeksAgoAvg: number | null;
  weeklyChange: number | null;
  twoWeekChange: number | null;
}

export function analyzeWeeklyData(
  metrics: WeeklyMetrics,
  profile: UserProfile,
  weightTrend: WeightTrendData,
  previousMetrics: WeeklyMetrics | null,
): CoachingDecision[] {
  const decisions: CoachingDecision[] = [];
  const goal = profile.goal || 'maintain';

  if (metrics.checkinCount < 3) {
    decisions.push({
      category: 'lifestyle',
      priority: 'medium',
      phase: 'data_collection',
      decision: 'insufficient_data',
      reasoning: `Seulement ${metrics.checkinCount} check-in(s) cette semaine. Minimum 4 pour une analyse fiable.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: 'Remplis ton check-in quotidien chaque jour pour recevoir des recommandations personnalisees.',
    });
    return decisions;
  }

  // Phase 9 Decision Tree: adherence -> sleep -> stress -> adjust
  const adherenceOk = checkAdherence(metrics, decisions);
  if (!adherenceOk) return decisions;

  const sleepOk = checkSleep(metrics, decisions);
  if (!sleepOk) return decisions;

  const stressOk = checkStress(metrics, decisions);
  if (!stressOk) return decisions;

  // Check for deload signals
  const needsDeload = checkDeloadSignals(metrics, previousMetrics, decisions);
  if (needsDeload) return decisions;

  // Main decision: weight trend analysis based on goal
  analyzeWeightTrend(metrics, profile, weightTrend, goal, decisions);

  // Recovery signals
  analyzeRecovery(metrics, decisions);

  return decisions;
}

function checkAdherence(metrics: WeeklyMetrics, decisions: CoachingDecision[]): boolean {
  const nutritionAdherence = metrics.adherenceNutritionAvg ?? 100;
  const trainingAdherence = metrics.adherenceTrainingAvg ?? 100;
  const overallAdherence = (nutritionAdherence + trainingAdherence) / 2;

  if (overallAdherence < 70) {
    decisions.push({
      category: 'lifestyle',
      priority: 'critical',
      phase: 'adherence_check',
      decision: 'low_adherence',
      reasoning: `Adherence a ${Math.round(overallAdherence)}% (nutrition: ${Math.round(nutritionAdherence)}%, entrainement: ${Math.round(trainingAdherence)}%). On ne modifie pas le plan tant que l'adherence est sous 90%.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: trainingAdherence < 70 ? 'Reduis temporairement le nombre de seances ou simplifie le split.' : null,
      lifestyleRecommendation: nutritionAdherence < 70
        ? 'Simplifie tes repas : meal prep, recettes rapides, moins de variete mais plus de regularite.'
        : 'Trouve les obstacles concrets a ton adherence et corrige-les un par un.',
    });
    return false;
  }

  if (overallAdherence < 90) {
    decisions.push({
      category: 'lifestyle',
      priority: 'high',
      phase: 'adherence_check',
      decision: 'moderate_adherence',
      reasoning: `Adherence a ${Math.round(overallAdherence)}%. Presque au seuil de 90% pour pouvoir ajuster le plan.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: 'Concentre-toi sur la regularite cette semaine. Aucun ajustement de calories tant que l\'adherence n\'est pas a 90%+.',
    });
    return false;
  }

  return true;
}

function checkSleep(metrics: WeeklyMetrics, decisions: CoachingDecision[]): boolean {
  const sleepHours = metrics.sleepHoursAvg ?? 7.5;
  const sleepQuality = metrics.sleepQualityAvg ?? 3;

  if (sleepHours < 6 || sleepQuality <= 2) {
    decisions.push({
      category: 'recovery',
      priority: 'critical',
      phase: 'sleep_check',
      decision: 'poor_sleep',
      reasoning: `Sommeil insuffisant (${sleepHours.toFixed(1)}h, qualite ${sleepQuality.toFixed(1)}/5). Le sommeil est prioritaire avant tout ajustement nutritionnel ou d'entrainement.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Reduis le volume de 20% cette semaine si la fatigue est elevee.',
      lifestyleRecommendation: 'Priorite absolue : 7h+ de sommeil. Ecran coupe 1h avant, chambre fraiche, routine fixe.',
    });
    return false;
  }

  if (sleepHours < 7) {
    decisions.push({
      category: 'recovery',
      priority: 'high',
      phase: 'sleep_check',
      decision: 'suboptimal_sleep',
      reasoning: `Sommeil en dessous de l'optimal (${sleepHours.toFixed(1)}h). Vise 7-9h pour une recuperation maximale.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: 'Ameliore progressivement : couche-toi 15min plus tot cette semaine.',
    });
  }

  return true;
}

function checkStress(metrics: WeeklyMetrics, decisions: CoachingDecision[]): boolean {
  const stress = metrics.stressAvg ?? 2;

  if (stress >= 4) {
    decisions.push({
      category: 'recovery',
      priority: 'high',
      phase: 'stress_check',
      decision: 'high_stress',
      reasoning: `Stress eleve (${stress.toFixed(1)}/5). Le stress chronique bloque la recuperation et la progression. On adresse le stress avant d'ajuster le plan.`,
      calorieAdjustment: 0,
      cardioRecommendation: 'Privilegie du cardio leger (marche, velo) pour gerer le stress.',
      trainingRecommendation: 'Maintiens l\'entrainement mais reduis le volume de 10-20% si necessaire.',
      lifestyleRecommendation: 'Techniques de gestion du stress : respiration, marche, deconnexion numerique.',
    });
    return false;
  }

  return true;
}

function checkDeloadSignals(
  metrics: WeeklyMetrics,
  previousMetrics: WeeklyMetrics | null,
  decisions: CoachingDecision[],
): boolean {
  if (!previousMetrics) return false;

  const motivationDrop = (metrics.motivationAvg ?? 3) <= 2;
  const fatiguHigh = (metrics.fatigueAvg ?? 2) >= 4;
  const sleepDegraded = (metrics.sleepQualityAvg ?? 3) <= 2;
  const performanceDown = previousMetrics.totalVolume > 0 &&
    metrics.totalVolume < previousMetrics.totalVolume * 0.85;

  const signalCount = [motivationDrop, fatiguHigh, sleepDegraded, performanceDown].filter(Boolean).length;

  if (signalCount >= 3) {
    decisions.push({
      category: 'deload',
      priority: 'critical',
      phase: 'deload_check',
      decision: 'deload_needed',
      reasoning: `${signalCount} signaux de surmenage detectes (motivation basse, fatigue elevee, sommeil degrade, performance en baisse). Deload recommande.`,
      calorieAdjustment: 0,
      cardioRecommendation: 'Reduis le cardio de 50% cette semaine.',
      trainingRecommendation: 'DELOAD : reduis le volume de 40-50%, garde l\'intensite moderee (RIR 3-4). Duree : 1 semaine.',
      lifestyleRecommendation: 'Augmente le sommeil, reduis les sources de stress, mange a maintenance.',
    });
    return true;
  }

  return false;
}

function analyzeWeightTrend(
  _metrics: WeeklyMetrics,
  profile: UserProfile,
  weightTrend: WeightTrendData,
  goal: string,
  decisions: CoachingDecision[],
): void {
  const { weeklyChange, twoWeekChange } = weightTrend;

  if (weeklyChange === null || twoWeekChange === null) {
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis',
      decision: 'insufficient_weight_data',
      reasoning: 'Pas assez de donnees de poids pour analyser la tendance. Continue a te peser regulierement (3-5x/semaine).',
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: 'Pese-toi chaque matin a jeun pour des donnees fiables.',
    });
    return;
  }

  const bodyWeight = profile.weight_kg || 80;

  if (goal === 'cut') {
    analyzeCutProgress(weeklyChange, twoWeekChange, bodyWeight, profile, decisions);
  } else if (goal === 'bulk') {
    analyzeBulkProgress(weeklyChange, twoWeekChange, bodyWeight, profile, decisions);
  } else {
    analyzeMaintenanceProgress(weeklyChange, twoWeekChange, bodyWeight, decisions);
  }
}

function analyzeCutProgress(
  weeklyChange: number,
  twoWeekChange: number,
  bodyWeight: number,
  _profile: UserProfile,
  decisions: CoachingDecision[],
): void {
  const targetRateMin = bodyWeight * 0.005;
  const targetRateMax = bodyWeight * 0.01;
  const weeklyLoss = -weeklyChange;

  if (twoWeekChange >= -0.1) {
    // Stall: no weight loss for 2 weeks
    decisions.push({
      category: 'nutrition',
      priority: 'high',
      phase: 'weight_stall_cut',
      decision: 'reduce_calories',
      reasoning: `Poids stagne depuis 2 semaines (variation: ${twoWeekChange > 0 ? '+' : ''}${twoWeekChange.toFixed(2)}kg). Adherence confirmee - on ajuste.`,
      calorieAdjustment: -125,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: 'Alternative a la reduction calorique : ajouter 2000 pas/jour OU 20min de cardio leger.',
    });
  } else if (weeklyLoss > targetRateMax) {
    // Losing too fast
    decisions.push({
      category: 'nutrition',
      priority: 'medium',
      phase: 'weight_analysis_cut',
      decision: 'too_fast_loss',
      reasoning: `Perte de ${weeklyLoss.toFixed(2)}kg/semaine, au-dessus de la cible max (${targetRateMax.toFixed(2)}kg). Risque de perte musculaire.`,
      calorieAdjustment: 100,
      cardioRecommendation: 'Reduis le cardio si tu en fais beaucoup.',
      trainingRecommendation: 'Maintiens l\'intensite pour preserver la masse musculaire.',
      lifestyleRecommendation: null,
    });
  } else if (weeklyLoss >= targetRateMin && weeklyLoss <= targetRateMax) {
    // Perfect rate
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis_cut',
      decision: 'on_track',
      reasoning: `Progression parfaite : perte de ${weeklyLoss.toFixed(2)}kg/sem (cible: ${targetRateMin.toFixed(2)}-${targetRateMax.toFixed(2)}kg). Ne change rien.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Continue avec le meme programme. Le meilleur plan est celui qu\'on ne modifie pas inutilement.',
      lifestyleRecommendation: null,
    });
  } else {
    // Losing but below target
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis_cut',
      decision: 'slow_progress',
      reasoning: `Perte de ${weeklyLoss.toFixed(2)}kg/sem, en dessous de la cible (${targetRateMin.toFixed(2)}kg). Patience - observe encore 1 semaine avant d'ajuster.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: null,
    });
  }
}

function analyzeBulkProgress(
  weeklyChange: number,
  twoWeekChange: number,
  bodyWeight: number,
  _profile: UserProfile,
  decisions: CoachingDecision[],
): void {
  const targetRateMin = bodyWeight * 0.0025;
  const targetRateMax = bodyWeight * 0.005;

  if (twoWeekChange <= 0.1) {
    // Stall: not gaining
    decisions.push({
      category: 'nutrition',
      priority: 'high',
      phase: 'weight_stall_bulk',
      decision: 'increase_calories',
      reasoning: `Poids ne progresse pas depuis 2 semaines (+${twoWeekChange.toFixed(2)}kg). On augmente l'apport.`,
      calorieAdjustment: 150,
      cardioRecommendation: 'Reduis le cardio si tu en fais plus de 3x/semaine.',
      trainingRecommendation: null,
      lifestyleRecommendation: null,
    });
  } else if (weeklyChange > targetRateMax) {
    // Gaining too fast
    decisions.push({
      category: 'nutrition',
      priority: 'medium',
      phase: 'weight_analysis_bulk',
      decision: 'too_fast_gain',
      reasoning: `Gain de ${weeklyChange.toFixed(2)}kg/sem, au-dessus de la cible max (${targetRateMax.toFixed(2)}kg). Risque de gain de gras excessif.`,
      calorieAdjustment: -100,
      cardioRecommendation: null,
      trainingRecommendation: 'Assure-toi que la force progresse aussi - un gain sans progression est suspect.',
      lifestyleRecommendation: null,
    });
  } else if (weeklyChange >= targetRateMin) {
    // On track
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis_bulk',
      decision: 'on_track',
      reasoning: `Progression ideale : +${weeklyChange.toFixed(2)}kg/sem (cible: ${targetRateMin.toFixed(2)}-${targetRateMax.toFixed(2)}kg). Continue ainsi.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Continue la surcharge progressive. Ne change rien.',
      lifestyleRecommendation: null,
    });
  } else {
    // Gaining but below target
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis_bulk',
      decision: 'slow_gain',
      reasoning: `Gain de ${weeklyChange.toFixed(2)}kg/sem, en dessous de la cible. Observe encore 1 semaine.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: null,
    });
  }
}

function analyzeMaintenanceProgress(
  _weeklyChange: number,
  twoWeekChange: number,
  bodyWeight: number,
  decisions: CoachingDecision[],
): void {
  const threshold = bodyWeight * 0.005;

  if (Math.abs(twoWeekChange) <= threshold) {
    decisions.push({
      category: 'nutrition',
      priority: 'low',
      phase: 'weight_analysis_maintain',
      decision: 'on_track',
      reasoning: `Poids stable (variation: ${twoWeekChange > 0 ? '+' : ''}${twoWeekChange.toFixed(2)}kg sur 2 semaines). Parfait pour la recomposition.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Focus sur la progression en force - c\'est le meilleur indicateur de recomposition.',
      lifestyleRecommendation: null,
    });
  } else if (twoWeekChange > threshold) {
    decisions.push({
      category: 'nutrition',
      priority: 'medium',
      phase: 'weight_analysis_maintain',
      decision: 'weight_creeping_up',
      reasoning: `Poids en hausse (+${twoWeekChange.toFixed(2)}kg sur 2 semaines). Ajustement leger recommande.`,
      calorieAdjustment: -100,
      cardioRecommendation: 'Ajoute 1500 pas/jour ou 1 seance de cardio leger.',
      trainingRecommendation: null,
      lifestyleRecommendation: null,
    });
  } else {
    decisions.push({
      category: 'nutrition',
      priority: 'medium',
      phase: 'weight_analysis_maintain',
      decision: 'weight_dropping',
      reasoning: `Poids en baisse (${twoWeekChange.toFixed(2)}kg sur 2 semaines). Augmente legerement l'apport.`,
      calorieAdjustment: 100,
      cardioRecommendation: null,
      trainingRecommendation: null,
      lifestyleRecommendation: null,
    });
  }
}

function analyzeRecovery(metrics: WeeklyMetrics, decisions: CoachingDecision[]): void {
  const soreness = metrics.sorenessAvg ?? 2;
  const jointPain = metrics.jointPainAvg ?? 1;

  if (jointPain >= 4) {
    decisions.push({
      category: 'training',
      priority: 'critical',
      phase: 'recovery_analysis',
      decision: 'high_joint_pain',
      reasoning: `Douleurs articulaires elevees (${jointPain.toFixed(1)}/5). Priorite : proteger les articulations.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Remplace les exercices douloureux par des alternatives. Reduis la charge et augmente les reps.',
      lifestyleRecommendation: 'Si la douleur persiste plus de 2 semaines, consulte un professionnel de sante.',
    });
  }

  if (soreness >= 4) {
    decisions.push({
      category: 'recovery',
      priority: 'medium',
      phase: 'recovery_analysis',
      decision: 'excessive_soreness',
      reasoning: `Courbatures elevees (${soreness.toFixed(1)}/5). Le volume est peut-etre trop eleve pour ta recuperation actuelle.`,
      calorieAdjustment: 0,
      cardioRecommendation: null,
      trainingRecommendation: 'Reduis le volume de 2-3 series par groupe musculaire cette semaine.',
      lifestyleRecommendation: 'Assure un apport proteique suffisant et un sommeil de qualite.',
    });
  }
}

export function calculateProteinTarget(weightKg: number, goal: string, experience: string): { min: number; max: number } {
  let factor = { min: 1.6, max: 2.2 };

  if (goal === 'cut') {
    factor = { min: 2.0, max: 2.4 };
  } else if (goal === 'bulk') {
    factor = { min: 1.6, max: 2.0 };
  }

  if (experience === 'beginner') {
    factor.min = Math.max(1.4, factor.min - 0.2);
    factor.max = Math.max(1.8, factor.max - 0.2);
  }

  return {
    min: Math.round(weightKg * factor.min),
    max: Math.round(weightKg * factor.max),
  };
}

export function calculateLipidTarget(weightKg: number): { min: number; max: number } {
  return {
    min: Math.round(weightKg * 0.8),
    max: Math.round(weightKg * 1.0),
  };
}

export function calculateCarbsFromRemaining(
  totalCalories: number,
  proteinGrams: number,
  fatGrams: number,
): number {
  const proteinCals = proteinGrams * 4;
  const fatCals = fatGrams * 9;
  const remaining = totalCalories - proteinCals - fatCals;
  return Math.max(0, Math.round(remaining / 4));
}

export function getWeeklyVolumeTarget(experience: string): { min: number; max: number } {
  switch (experience) {
    case 'beginner': return { min: 10, max: 12 };
    case 'intermediate': return { min: 14, max: 16 };
    case 'advanced': return { min: 18, max: 20 };
    case 'elite': return { min: 20, max: 24 };
    default: return { min: 12, max: 16 };
  }
}

export function getTrainingFrequencyTarget(experience: string, available: number): number {
  const ranges: Record<string, [number, number]> = {
    beginner: [2, 3],
    intermediate: [3, 5],
    advanced: [4, 6],
    elite: [5, 6],
  };
  const [min, max] = ranges[experience] ?? [3, 5];
  return Math.max(min, Math.min(max, available));
}

export function getStepsTarget(goal: string, current: number): number {
  const base = goal === 'cut' ? 10000 : 7000;
  if (current < base) return Math.min(current + 2000, base);
  return current;
}
