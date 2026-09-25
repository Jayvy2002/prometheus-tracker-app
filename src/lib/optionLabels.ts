import type { TFunction } from 'i18next';

export type OptionGroup =
  | 'genders'
  | 'diet'
  | 'allergies'
  | 'meals'
  | 'setTypes'
  | 'setTypeShort'
  | 'trainingExperience'
  | 'trainingFocus'
  | 'activity'
  | 'goals'
  | 'cooking'
  | 'stress'
  | 'hydration'
  | 'supplements'
  | 'motivations';

/**
 * Labels for the enum-like lists in constants.ts. The `value` stays the stored key;
 * the label shown follows the viewer's language, with the English constant as fallback
 * so an unknown value never renders as a raw i18n key.
 */
export function optionLabel(t: TFunction, group: OptionGroup, value: string, fallback = value): string {
  if (!value) return fallback;
  return t(`options.${group}.${value}`, { defaultValue: fallback });
}

export function optionDescription(
  t: TFunction,
  group: OptionGroup,
  value: string,
  fallback = '',
): string {
  if (!value) return fallback;
  return t(`options.${group}.${value}Hint`, { defaultValue: fallback });
}

export function optionPlaceholder(t: TFunction, key: string, fallback = ''): string {
  return t(`options.placeholders.${key}`, { defaultValue: fallback });
}
