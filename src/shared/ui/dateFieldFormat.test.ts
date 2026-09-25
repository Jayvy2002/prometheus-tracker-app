import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  checkDateBounds,
  dateOrderFor,
  formatIsoForInput,
  isIsoDate,
  parseTypedDate,
  withAutoSlash,
} from './dateFieldFormat';
import DateField from './DateField';
import DateInput from './DateInput';
import { dateLocale } from '../../lib/utils';
import fr from '../../i18n/locales/fr';
import en from '../../i18n/locales/en';

const valid = (iso: string) => ({ status: 'valid', iso });

test('the order follows the app language, with the same rule as dateLocale', () => {
  for (const lang of ['fr', 'fr-FR', 'fr-CA', 'en', 'en-US', 'EN-gb', 'de', '', undefined]) {
    const expected = dateLocale(lang) === 'en-US' ? 'mdy' : 'dmy';
    assert.equal(dateOrderFor(lang), expected, String(lang));
  }
});

test('ISO dates are shown jj/mm/aaaa in French and mm/dd/yyyy in English', () => {
  assert.equal(formatIsoForInput('2026-09-24', 'fr'), '24/09/2026');
  assert.equal(formatIsoForInput('2026-09-24', 'en'), '09/24/2026');
  assert.equal(formatIsoForInput('1987-01-05', 'en-US'), '01/05/1987');
  assert.equal(formatIsoForInput('', 'fr'), '');
  assert.equal(formatIsoForInput(null, 'fr'), '');
  assert.equal(formatIsoForInput('2026-02-30', 'fr'), '');
  assert.equal(formatIsoForInput('2026-09-24T12:00:00', 'fr'), '');
});

test('isIsoDate accepts only a strict real day', () => {
  assert.ok(isIsoDate('2024-02-29'));
  assert.ok(!isIsoDate('2023-02-29'));
  assert.ok(!isIsoDate('1900-02-29'));
  assert.ok(isIsoDate('2000-02-29'));
  assert.ok(!isIsoDate('2026-9-24'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('2026-09-24T00:00:00'));
  assert.ok(!isIsoDate(undefined));
});

test('typing reads day/month in French and month/day in English', () => {
  assert.deepEqual(parseTypedDate('05/01/1987', 'fr'), valid('1987-01-05'));
  assert.deepEqual(parseTypedDate('05/01/1987', 'en'), valid('1987-05-01'));
  assert.deepEqual(parseTypedDate('24/09/2026', 'en'), { status: 'impossible' });
  assert.deepEqual(parseTypedDate('09/24/2026', 'fr'), { status: 'impossible' });
});

test('typing tolerates / - . and spaces, one digit, eight digits and a pasted ISO date', () => {
  for (const text of ['24/09/2026', '24-09-2026', '24.09.2026', '24 09 2026', ' 24 / 9 / 2026 ', '24092026', '2026-09-24', '2026/9/24']) {
    assert.deepEqual(parseTypedDate(text, 'fr'), valid('2026-09-24'), text);
  }
  assert.deepEqual(parseTypedDate('9/24/2026', 'en'), valid('2026-09-24'));
  assert.deepEqual(parseTypedDate('09242026', 'en'), valid('2026-09-24'));
});

test('empty, incomplete and impossible dates are told apart', () => {
  assert.deepEqual(parseTypedDate('', 'fr'), { status: 'empty' });
  assert.deepEqual(parseTypedDate('   ', 'en'), { status: 'empty' });
  for (const text of ['24/09', '24/09/26', '24/09/20266', 'demain', '24//09/2026', '2409']) {
    assert.deepEqual(parseTypedDate(text, 'fr'), { status: 'partial' }, text);
  }
  for (const text of ['31/02/2026', '29/02/2023', '00/01/2026', '12/13/2026', '2026-02-30', '01/01/0999']) {
    assert.deepEqual(parseTypedDate(text, 'fr'), { status: 'impossible' }, text);
  }
  // Birth dates are not limited to 2000–2099 (the old DateInput limit).
  assert.deepEqual(parseTypedDate('14/07/1954', 'fr'), valid('1954-07-14'));
  assert.deepEqual(parseTypedDate('29/02/2024', 'fr'), valid('2024-02-29'));
});

test('bounds are inclusive and a malformed bound is ignored', () => {
  assert.equal(checkDateBounds('2026-09-24', '2026-09-24', '2026-09-24'), 'ok');
  assert.equal(checkDateBounds('2026-09-23', '2026-09-24'), 'beforeMin');
  assert.equal(checkDateBounds('2026-09-25', undefined, '2026-09-24'), 'afterMax');
  assert.equal(checkDateBounds('2026-09-25', '', ''), 'ok');
  assert.equal(checkDateBounds('2026-09-25', 'bad', '24/09/2026'), 'ok');
});

test('the slash follows the day and the month on number pads, never doubled', () => {
  assert.equal(withAutoSlash('2', '24'), '24/');
  assert.equal(withAutoSlash('24/0', '24/09'), '24/09/');
  assert.equal(withAutoSlash('24/09/202', '24/09/2026'), '24/09/2026');
  assert.equal(withAutoSlash('24/', '24//'), '24/');
  assert.equal(withAutoSlash('24/', '24/-'), '24/');
  assert.equal(withAutoSlash('24/', '24'), '24');
  assert.equal(withAutoSlash('', '24092026'), '24092026');
  assert.equal(withAutoSlash('4/09', '24/09'), '24/09');
  assert.equal(withAutoSlash('1', '1/'), '1/');
});

// The test loader compiles JSX in classic mode (React.createElement); the app build uses react-jsx.
(globalThis as unknown as { React: typeof React }).React = React;

async function render(language: string, element: ReturnType<typeof createElement>) {
  const instance = createInstance();
  await instance.init({ lng: language, resources: { fr: { translation: fr }, en: { translation: en } } });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, element));
}

test('DateField shows the app language format, a named 44 px picker button and the ISO native input', async () => {
  const props = { id: 'dob', label: 'Naissance', value: '1987-01-05', max: '2026-09-24', onChange: () => undefined };
  const french = await render('fr', createElement(DateField, props));
  const english = await render('en', createElement(DateField, props));
  assert.match(french, /type="text"[^>]*value="05\/01\/1987"/);
  assert.match(english, /type="text"[^>]*value="01\/05\/1987"/);
  assert.match(french, /placeholder="jj\/mm\/aaaa"/);
  assert.match(english, /placeholder="mm\/dd\/yyyy"/);
  assert.match(french, /aria-label="Ouvrir le calendrier"/);
  assert.match(english, /aria-label="Open calendar"/);
  assert.match(french, /min-h-11 min-w-11/);
  assert.match(french, /<label for="dob"/);
  const native = /<input type="date"[^>]*>/.exec(french)?.[0] ?? '';
  assert.match(native, /aria-hidden="true"/);
  assert.match(native, /tabindex="-1"/);
  assert.match(native, /value="1987-01-05"/, 'the native picker holds the ISO value');
  assert.match(native, /max="2026-09-24"/);
  assert.doesNotMatch(french, /aria-invalid/);
});

test('DateField ties a form error to the field; an empty value renders empty', async () => {
  const html = await render('fr', createElement(DateField, { id: 'd', value: '', error: 'Obligatoire', onChange: () => undefined }));
  assert.match(html, /type="text"[^>]*value=""/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="d-error"/);
  assert.match(html, /<p id="d-error" role="alert"[^>]*>Obligatoire<\/p>/);
});

test('DateInput (workout logger) shows the day of a timestamp in the app language', async () => {
  const html = await render('en', createElement(DateInput, {
    value: '2026-09-24T12:00:00', onChange: () => undefined, 'aria-label': 'Session date',
  }));
  assert.match(html, /aria-label="Session date"[^>]*value="09\/24\/2026"|value="09\/24\/2026"[^>]*aria-label="Session date"/);
  const source = readFileSync(resolve(process.cwd(), 'src/shared/ui/DateInput.tsx'), 'utf8');
  assert.match(source, /T12:00:00/, 'the logger keeps its local-noon timestamp contract');
  assert.match(source, /<DateField/);
});

test('FR and EN carry the same DateField texts', () => {
  assert.deepEqual(Object.keys(fr.dateField).sort(), Object.keys(en.dateField).sort());
  assert.equal(fr.dateField.placeholder, 'jj/mm/aaaa');
  assert.equal(en.dateField.placeholder, 'mm/dd/yyyy');
});

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

test('no screen uses the phone-formatted native date input directly', () => {
  const root = resolve(process.cwd(), 'src');
  const offenders = tsxFiles(root)
    .filter(file => !file.endsWith(join('shared', 'ui', 'DateField.tsx')))
    .filter(file => /type=["']date["']/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(resolve(process.cwd(), 'src/components/ui/DateField.tsx'), 'utf8'), /shared\/ui\/DateField/);
});
