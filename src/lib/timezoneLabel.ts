const CITY_FR: Record<string, string> = {
  'America/Toronto': 'Montréal — heure de l’Est',
  'America/Montreal': 'Montréal — heure de l’Est',
  'America/Vancouver': 'Vancouver — heure du Pacifique',
  'Europe/Paris': 'Paris — heure de Paris',
  'UTC': 'UTC',
};

const CITY_EN: Record<string, string> = {
  'America/Toronto': 'Montreal — Eastern Time',
  'America/Montreal': 'Montreal — Eastern Time',
  'America/Vancouver': 'Vancouver — Pacific Time',
  'Europe/Paris': 'Paris — Central European Time',
  'UTC': 'UTC',
};

export function timezoneDisplayLabel(tz: string, locale: string): string {
  const table = locale.toLowerCase().startsWith('fr') ? CITY_FR : CITY_EN;
  if (table[tz]) return table[tz];
  return tz.replace(/_/g, ' ');
}
