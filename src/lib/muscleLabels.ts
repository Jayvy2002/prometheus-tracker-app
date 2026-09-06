/** Canonical library ids (English snake_case) → labels shown in the UI. */
export const MUSCLE_LABELS_FR: Record<string, string> = {
  chest: 'Pectoraux',
  upper_chest: 'Haut pec',
  lower_chest: 'Bas pec',
  front_delts: 'Épaules avant',
  side_delts: 'Épaules lat.',
  rear_delts: 'Épaules arr.',
  traps: 'Trapèzes',
  lats: 'Dorsaux',
  rhomboids: 'Rhomboïdes',
  lower_back: 'Lombaires',
  core: 'Abdos',
  quadriceps: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  glutes: 'Fessiers',
  calves: 'Mollets',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  rotator_cuff: 'Coiffe rot.',
  hip_flexors: 'Fléchisseurs',
  adductors: 'Adducteurs',
  abductors: 'Abducteurs',
  shoulders: 'Épaules',
  obliques: 'Obliques',
};

export const MUSCLE_LABELS_EN: Record<string, string> = {
  chest: 'Chest',
  upper_chest: 'Upper chest',
  lower_chest: 'Lower chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  traps: 'Traps',
  lats: 'Lats',
  rhomboids: 'Rhomboids',
  lower_back: 'Lower back',
  core: 'Core',
  quadriceps: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  rotator_cuff: 'Rotator cuff',
  hip_flexors: 'Hip flexors',
  adductors: 'Adductors',
  abductors: 'Abductors',
  shoulders: 'Shoulders',
  obliques: 'Obliques',
};

export function muscleLabel(id: string, language = 'fr'): string {
  const en = language.toLowerCase().startsWith('en');
  const map = en ? MUSCLE_LABELS_EN : MUSCLE_LABELS_FR;
  return map[id] ?? id.replace(/_/g, ' ');
}
