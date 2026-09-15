import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Concatène le baril i18n et les modules 22b — les verrous source lisent les textes entiers. */
export function i18nLocaleSource(locale: 'fr' | 'en'): string {
  const barrel = resolve(process.cwd(), `src/i18n/locales/${locale}.ts`);
  const dir = resolve(process.cwd(), `src/i18n/locales/${locale}`);
  const modules = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => readFileSync(resolve(dir, name), 'utf8'));
  return [readFileSync(barrel, 'utf8'), ...modules].join('\n');
}
