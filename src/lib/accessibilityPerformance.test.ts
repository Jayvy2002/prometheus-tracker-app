import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DARK_NEUTRAL, DARK_TOKENS } from '../shared/theme/palette';
import { contrastRatio } from '../shared/theme/contrast';

const root = process.cwd();
const src = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') && !name.includes('.test.') ? [path] : [];
  });
}

test('audit 3 (F): greys are readable on the black background', () => {
  // The dark greys now live in the theme palette (CSS variables, dark by default).
  const palette = src('src/shared/theme/palette.ts');
  assert.match(palette, /500: '#949494'/);
  assert.match(palette, /600: '#858585'/);
  assert.match(palette, /'ink-muted': '#949494'/);
  assert.equal(DARK_NEUTRAL[500], '#949494');
  assert.equal(DARK_NEUTRAL[600], '#858585');
  assert.equal(DARK_TOKENS['ink-muted'], '#949494');
  // AA small text on the black page and on the #171717 cards.
  for (const grey of [DARK_NEUTRAL[500], DARK_NEUTRAL[600], DARK_TOKENS['ink-muted']]) {
    assert.ok(contrastRatio(grey, '#000000') >= 4.5, grey);
    assert.ok(contrastRatio(grey, '#171717') >= 4.5, grey);
  }
  const all = tsxFiles(resolve(root, 'src')).map(f => readFileSync(f, 'utf8')).join('\n');
  // No 9 px text; chart ticks follow the same floor.
  assert.doesNotMatch(all, /text-\[9px\]/);
  assert.doesNotMatch(all, /fontSize: 9\b/);
  assert.doesNotMatch(all, /fill: '#737373'/);
});

test('audit 3 (F): icon-only buttons are named and large enough', () => {
  const checks: Array<[string, RegExp]> = [
    ['src/components/routines/RoutineForm.tsx', /aria-label=\{`\$\{t\('common\.moveUp'\)\}/],
    ['src/components/routines/RoutineForm.tsx', /aria-label=\{`\$\{t\('common\.moveDown'\)\}/],
    ['src/components/routines/RoutineForm.tsx', /aria-label=\{t\('common\.close'\)\}/],
    ['src/components/coaching/ClientsPage.tsx', /aria-label=\{t\('coaching\.invite\.copyLink'\)\}/],
    ['src/components/scanner/UnifiedScanner.tsx', /aria-label=\{t\('common\.removePhoto'\)\}/],
    ['src/components/scanner/UnifiedScanner.tsx', /aria-label=\{t\('common\.choosePhoto'\)\}/],
    ['src/components/workout/SessionTimer.tsx', /common\.timerPause/],
    ['src/components/workout/ExerciseCard.tsx', /common\.collapse' : 'common\.expand'/],
    ['src/components/workout/ExerciseProgressPage.tsx', /aria-label=\{t\('common\.back'\)\}/],
  ];
  for (const [file, pattern] of checks) assert.match(src(file), pattern, file);
  // The old 20 px icon buttons are gone from these screens.
  assert.doesNotMatch(src('src/components/routines/RoutineForm.tsx'), /className="p-1\.5 text-neutral-400/);
  assert.doesNotMatch(src('src/components/scanner/UnifiedScanner.tsx'), /size=\{10\}/);
});

test('audit 3 (F): motion is reduced globally when the device asks for it', () => {
  const css = src('src/index.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-delay: 0s !important/);
  assert.match(css, /transition-duration: 0\.01ms !important/);
});

test('audit 3 (F): only French ships in the main bundle, English loads on demand', () => {
  const i18n = src('src/i18n/index.ts');
  assert.doesNotMatch(i18n, /import en from/);
  assert.match(i18n, /import\('\.\/locales\/en'\)/);
  assert.match(i18n, /partialBundledLanguages: true/);
  assert.match(i18n, /export function ensureLanguage/);
  // The switch waits for the texts: never a screen of raw keys.
  assert.match(i18n, /ensureLanguage\(lang\)\s*\n\s*\.then\(\(\) => i18n\.changeLanguage\(lang\)\)/);
  // The English questionnaire preview loads English first.
  assert.match(src('src/components/coaching/CoachQuestionnairePage.tsx'), /ensureLanguage\('en'\)\.then\(\(\) => setPreviewLang\('en'\)\)/);
});
