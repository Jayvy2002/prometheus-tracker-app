import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { formatPriceInput, parsePriceInput } from '../components/marketplace/priceInput';

test('the rate is shown the way the language writes it, without « .00 »', () => {
  assert.equal(formatPriceInput(12000, 'fr'), '120');
  assert.equal(formatPriceInput(12000, 'en'), '120');
  assert.equal(formatPriceInput(12050, 'fr'), '120,50');
  assert.equal(formatPriceInput(12050, 'en-GB'), '120.50');
  assert.equal(formatPriceInput(12005, 'fr-FR'), '120,05');
  assert.equal(formatPriceInput(null, 'fr'), '');
  assert.equal(formatPriceInput(0, 'fr'), '');
});

test('comma or dot are accepted and stored as exact cents', () => {
  assert.deepEqual(parsePriceInput('120'), { ok: true, cents: 12000 });
  assert.deepEqual(parsePriceInput('120,5'), { ok: true, cents: 12050 });
  assert.deepEqual(parsePriceInput('120.50'), { ok: true, cents: 12050 });
  assert.deepEqual(parsePriceInput('19,99'), { ok: true, cents: 1999 });
  assert.deepEqual(parsePriceInput('0,29'), { ok: true, cents: 29 });
  assert.deepEqual(parsePriceInput(' 1 200,00 '), { ok: true, cents: 120000 });
  assert.deepEqual(parsePriceInput('120,'), { ok: true, cents: 12000 });
  assert.deepEqual(parsePriceInput(''), { ok: true, cents: null });
  assert.deepEqual(parsePriceInput('0'), { ok: true, cents: null });
  // Refused rather than guessed.
  assert.deepEqual(parsePriceInput('12,345'), { ok: false });
  assert.deepEqual(parsePriceInput('-5'), { ok: false });
  assert.deepEqual(parsePriceInput('abc'), { ok: false });
  assert.deepEqual(parsePriceInput('1.200,50'), { ok: false });
  // Round trip.
  for (const cents of [100, 12000, 12050, 1999, 5]) {
    for (const lang of ['fr', 'en']) {
      assert.deepEqual(parsePriceInput(formatPriceInput(cents, lang)), { ok: true, cents });
    }
  }
});

test('coach profile: formatted rate and a save bar that never covers a field', () => {
  const form = readFileSync(resolve(process.cwd(), 'src/components/marketplace/CoachOfferForm.tsx'), 'utf8');
  assert.match(form, /formatPriceInput/);
  assert.match(form, /parsePriceInput/);
  assert.doesNotMatch(form, /toFixed\(2\)/);
  assert.match(form, /FixedActionBar/);
  assert.match(form, /form=\{formId\}/);
  const bar = readFileSync(resolve(process.cwd(), 'src/components/coaching/FixedActionBar.tsx'), 'utf8');
  assert.match(bar, /createPortal/);
  assert.match(bar, /scrollPaddingBottom/);
  assert.match(bar, /bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] md:bottom-0 md:left-64/);
});
