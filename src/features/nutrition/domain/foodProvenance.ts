export type FoodProvenanceKind =
  | 'openfoodfacts'
  | 'catalog'
  | 'favorite'
  | 'recent'
  | 'manual'
  | 'recipe';

export function foodProvenanceKind(input: {
  data_source?: string | null;
  _source?: string | null;
} | null | undefined): FoodProvenanceKind {
  if (!input) return 'manual';
  if (input._source === 'favorite') return 'favorite';
  if (input._source === 'recent') return 'recent';
  if (input._source === 'recipe') return 'recipe';
  if (input._source === 'openfoodfacts' || input.data_source === 'openfoodfacts') return 'openfoodfacts';
  if (input.data_source === 'user') return 'manual';
  if (input._source === 'db' || input.data_source) return 'catalog';
  return 'manual';
}

export function foodProvenanceKey(kind: FoodProvenanceKind): `nutrition.foodForm.provenance.${FoodProvenanceKind}` {
  return `nutrition.foodForm.provenance.${kind}`;
}
