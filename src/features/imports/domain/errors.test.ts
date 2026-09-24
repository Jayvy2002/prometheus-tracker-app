import test from 'node:test';
import assert from 'node:assert/strict';
import { importErrorCode, isImportIncident } from './errors';

test('parse failures and unknown errors are incidents; coach decisions are not', () => {
  assert.equal(isImportIncident('malformed_csv'), true);
  assert.equal(isImportIncident('too_many_rows'), true);
  assert.equal(isImportIncident(importErrorCode('fetch failed')), true);
  assert.equal(isImportIncident('already_imported'), false);
  assert.equal(isImportIncident('potential_duplicate'), false);
  assert.equal(isImportIncident('preview_quota'), false);
});
