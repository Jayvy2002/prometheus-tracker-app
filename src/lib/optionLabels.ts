import type { TFunction } from 'i18next';

export type OptionGroup =
  | 'genders'
  | 'diet'
  | 'allergies'
  | 'meals'
  | 'setTypes'
  | 'trainingExperience'
  | 'trainingFocus';

/**
 * Labels for the enum-like lists in constants.ts. The `value` stays the stored key;
 * the label shown follows the viewer's language, with the English constant as fallback
 * so an unknown value never renders as a raw i18n key.
 */
export function optionLabel(t: TFunction, group: OptionGroup, value: string, fallback = value): string {
  return t(`options.${group}.${value}`, { defaultValue: fallback });
}
