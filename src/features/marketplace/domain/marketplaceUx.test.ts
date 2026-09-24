import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isOpenRequest, requestStep } from '../../../components/marketplace/marketplaceCopy';
import { marketplaceUiSource } from '../../../lib/marketplaceUiSource';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('a request reads as three steps; closed requests have none', () => {
  assert.equal(requestStep('pending'), 'sent');
  assert.equal(requestStep('coach_accepted'), 'accepted');
  assert.equal(requestStep('athlete_confirmed'), 'confirmed');
  assert.equal(requestStep('accepted'), 'confirmed');
  assert.equal(requestStep('declined'), null);
  assert.equal(requestStep('withdrawn'), null);
  assert.equal(isOpenRequest('pending'), true);
  assert.equal(isOpenRequest('coach_accepted'), true);
  assert.equal(isOpenRequest('athlete_confirmed'), false);
});

test('marketplace UI: one « find a coach » place, short request, final athlete confirmation kept', () => {
  const ui = marketplaceUiSource();
  // Filters are pills, not selects; the guided search is one card away.
  assert.match(src('src/components/marketplace/DirectoryView.tsx'), /ChipGroup/);
  assert.doesNotMatch(src('src/components/marketplace/DirectoryView.tsx'), /<select/);
  assert.match(src('src/components/marketplace/DirectoryView.tsx'), /to="\/coaches\/match"/);
  // The request keeps both consents and the versioned sharing agreement.
  const detail = src('src/components/marketplace/CoachDetailView.tsx');
  assert.match(detail, /required checked=\{consent\}/);
  assert.match(detail, /required checked=\{relationshipConsent\}/);
  assert.match(detail, /disabled=\{!consent \|\| !relationshipConsent/);
  assert.match(ui, /p_sharing_version: MARKETPLACE_CONSENT_VERSION/);
  // Optional details are folded, not eight open fields.
  assert.match(detail, /marketplace\.moreDetails/);
  // Accepting never activates: the athlete confirms, with the scopes one tap away.
  const card = src('src/components/marketplace/RequestCard.tsx');
  assert.match(card, /marketplace\.confirmActivatesFollow/);
  assert.match(card, /DIRECT_INVITE_CONSENT_SCOPES/);
  assert.match(card, /coachSide_\$\{row\.status\}/);
  // Guided search explains matches; no compatibility score anywhere.
  assert.doesNotMatch(ui, /marketplace\.compatible/);
  assert.match(src('src/components/marketplace/CoachMatchPage.tsx'), /step === 'results'/);
  // Reporting stays reachable as a quiet link.
  assert.match(src('src/components/marketplace/MarketplaceReportForm.tsx'), /aria-expanded=\{open\}/);
});
