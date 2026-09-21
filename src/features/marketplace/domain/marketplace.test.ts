import assert from 'node:assert/strict';
import { test } from 'node:test';
import en from '../../../i18n/locales/en/marketplace';
import fr from '../../../i18n/locales/fr/marketplace';
import { comparisonIds, coachingRequestKey, clearCoachingRequestKey, coachingReportKey, clearCoachingReportKey, isProspectConversationStatus, marketFilters, matchingReasons, normalizeJoinRequestStatus, requestActions, requestActivatesFollow, requestRelationshipCopyKey, resolveRelationshipState, type CoachPublicProfile, type CoachingLinkRecord, type CoachingRequest } from './marketplace';

const coach = 'a1780000-0000-4000-8000-000000000001';
const client = 'a1780000-0000-4000-8000-000000000003';
const otherCoach = 'a1780000-0000-4000-8000-000000000002';
const otherClient = 'a1780000-0000-4000-8000-000000000004';

function request(status: CoachingRequest['status'], relationship_state?: CoachingRequest['relationship_state']): CoachingRequest {
  return { id:'r', coach_id:coach, client_id:client, public_name:'Client', summary:'Summary', sharing_version:2, status, created_at:'', updated_at:'', relationship_state };
}

function localeText(dict: typeof fr, key: string | null): string {
  if (!key) return '';
  const name = key.startsWith('marketplace.') ? key.slice('marketplace.'.length) : key;
  return String(dict.marketplace[name as keyof typeof dict.marketplace] ?? '');
}

function cardTexts(status: CoachingRequest['status'], state: CoachingRequest['relationship_state'], viewerId: string) {
  const row = request(status, state);
  const relationshipKey = requestRelationshipCopyKey(row, viewerId);
  return {
    fr: { status: localeText(fr, `marketplace.${status}`), relationship: localeText(fr, relationshipKey) },
    en: { status: localeText(en, `marketplace.${status}`), relationship: localeText(en, relationshipKey) },
    relationshipKey,
  };
}

function combined(side: { status: string; relationship: string }): string {
  return `${side.status}\n${side.relationship}`;
}

const confirmationVocabFr = /confirmé|confirmation/i;
const confirmationVocabEn = /confirmed|confirmation/i;
const activeClaimFr = /est actif/i;
const activeClaimEn = /coaching is active|now active/i;

test('prospect conversation is open for pending and coach_accepted, never for closed states', () => {
  assert.equal(isProspectConversationStatus('pending'), true);
  assert.equal(isProspectConversationStatus('coach_accepted'), true);
  assert.equal(isProspectConversationStatus('athlete_confirmed'), false);
  assert.equal(isProspectConversationStatus('declined'), false);
});
test('search only accepts implemented criteria and keeps compatible URL filters', () => {
 assert.deepEqual(marketFilters(new URLSearchParams('discipline=unknown&language=en&format=online&score=99')), { discipline:'',language:'en',format:'online' });
});
test('matching explanations only state declared matching profile facts', () => {
 const profile={disciplines:['strength'],languages:['en'],formats:['online']} as CoachPublicProfile;
 assert.deepEqual(matchingReasons(profile,{discipline:'strength',language:'fr',format:'online'}),['strength','online']);
});
test('prospect and coach can only see actions corresponding to their side and current state', () => {
 const row={coach_id:'coach',client_id:'client',status:'pending'} as CoachingRequest;
 assert.deepEqual(requestActions(row,'stranger'),[]);
 assert.deepEqual(requestActions(row,'client'),['withdrawn']);
 assert.deepEqual(requestActions(row,'coach'),['accepted','declined']);
 assert.deepEqual(requestActions({...row,status:'coach_accepted'},'coach'),[]);
 assert.deepEqual(requestActions({...row,status:'coach_accepted'},'client'),['confirmed','withdrawn']);
 assert.deepEqual(requestActions({...row,status:'athlete_confirmed'},'coach'),[]);
 assert.deepEqual(requestActions({...row,status:'athlete_confirmed'},'client'),[]);
 assert.deepEqual(requestActions({...row,status:'withdrawn'},'client'),[]);
 assert.deepEqual(requestActions({...row,status:'accepted'},'coach'),[]);
 assert.deepEqual(requestActions({...row,status:'accepted'},'client'),[]);
 assert.deepEqual(requestActions({...row,status:'declined'},'client'),[]);
 assert.equal(normalizeJoinRequestStatus('accepted'),'accepted');
 assert.equal(normalizeJoinRequestStatus('coach_accepted'),'coach_accepted');
 assert.equal(requestActivatesFollow('athlete_confirmed'),true);
 assert.equal(requestActivatesFollow('accepted'),true);
 assert.equal(requestActivatesFollow('coach_accepted'),false);
 assert.equal(requestActivatesFollow('pending'),false);
 assert.throws(()=>normalizeJoinRequestStatus('nope'));
});

test('relationship state is read from matching coach_client_links, never from another pair', () => {
  const links: CoachingLinkRecord[] = [
    { coach_id: otherCoach, client_id: client, status: 'active', updated_at: '2026-09-18T12:00:00Z' },
    { coach_id: coach, client_id: otherClient, status: 'active', updated_at: '2026-09-18T12:00:00Z' },
  ];
  assert.equal(resolveRelationshipState(coach, client, links), 'unknown');
});

test('an active link for the pair wins over an ended record', () => {
  const links: CoachingLinkRecord[] = [
    { coach_id: coach, client_id: client, status: 'ended', updated_at: '2026-09-18T18:00:00Z' },
    { coach_id: coach, client_id: client, status: 'active', updated_at: '2026-01-01T00:00:00Z' },
    { coach_id: otherCoach, client_id: client, status: 'ended', updated_at: '2026-09-19T00:00:00Z' },
  ];
  assert.equal(resolveRelationshipState(coach, client, links), 'active');
});

test('ended links for the pair resolve as ended using the most recent leftover', () => {
  const links: CoachingLinkRecord[] = [
    { coach_id: coach, client_id: client, status: 'ended', updated_at: '2026-01-01T00:00:00Z' },
    { coach_id: coach, client_id: client, status: 'ended', updated_at: '2026-09-18T12:00:00Z' },
    { coach_id: otherCoach, client_id: client, status: 'active', updated_at: '2026-09-19T00:00:00Z' },
  ];
  assert.equal(resolveRelationshipState(coach, client, links), 'ended');
});

test('historical accepted follows the real link even without a consent row', () => {
  assert.equal(resolveRelationshipState(coach, client, [{ coach_id: coach, client_id: client, status: 'active' }]), 'active');
  assert.equal(resolveRelationshipState(coach, client, [{ coach_id: coach, client_id: client, status: 'ended', updated_at: '2026-09-01T00:00:00Z' }]), 'ended');
  assert.equal(resolveRelationshipState(coach, client, []), 'unknown');
});

test('request cards describe historical accepted follows without inventing athlete confirmation', () => {
  const active = cardTexts('accepted', 'active', client);
  assert.equal(active.fr.status, 'Suivi historique — ouvert à l’acceptation du coach.');
  assert.equal(active.en.status, 'Historical follow — opened when the coach accepted.');
  assert.equal(active.fr.relationship, 'Le suivi avec ce coach est actif. Ce n’est pas un paiement.');
  assert.equal(active.en.relationship, 'Coaching with this coach is now active. This is not a payment.');
  assert.doesNotMatch(combined(active.fr), confirmationVocabFr);
  assert.doesNotMatch(combined(active.en), confirmationVocabEn);

  const ended = cardTexts('accepted', 'ended', client);
  assert.equal(ended.fr.relationship, 'Ce suivi est terminé.');
  assert.equal(ended.en.relationship, 'This coaching relationship has ended.');
  assert.doesNotMatch(combined(ended.fr), confirmationVocabFr);
  assert.doesNotMatch(combined(ended.en), confirmationVocabEn);

  const unknown = cardTexts('accepted', 'unknown', client);
  assert.equal(unknown.relationshipKey, 'marketplace.relationshipUnknownHistorical');
  assert.equal(unknown.fr.relationship, 'Le statut actuel de ce suivi historique est indisponible.');
  assert.equal(unknown.en.relationship, 'The current status of this historical coaching relationship is unavailable.');
  assert.doesNotMatch(combined(unknown.fr), confirmationVocabFr);
  assert.doesNotMatch(combined(unknown.en), confirmationVocabEn);
  assert.doesNotMatch(unknown.fr.relationship, /confirmée|confirmé/i);
  assert.doesNotMatch(unknown.en.relationship, /confirmed/i);

  const coachActive = cardTexts('accepted', 'active', coach);
  assert.equal(coachActive.relationshipKey, 'marketplace.coachingActiveCoachHistorical');
  assert.doesNotMatch(combined(coachActive.fr), confirmationVocabFr);
  assert.doesNotMatch(combined(coachActive.en), confirmationVocabEn);
});

test('athlete_confirmed cards keep the confirmation event and the current follow state separate', () => {
  const active = cardTexts('athlete_confirmed', 'active', client);
  assert.equal(active.fr.status, 'Confirmation de l’athlète enregistrée.');
  assert.equal(active.en.status, 'Athlete confirmation recorded.');
  assert.match(active.fr.relationship, activeClaimFr);
  assert.match(active.en.relationship, activeClaimEn);

  const ended = cardTexts('athlete_confirmed', 'ended', client);
  assert.equal(ended.fr.status, 'Confirmation de l’athlète enregistrée.');
  assert.equal(ended.en.status, 'Athlete confirmation recorded.');
  assert.equal(ended.fr.relationship, 'Ce suivi est terminé.');
  assert.equal(ended.en.relationship, 'This coaching relationship has ended.');
  assert.doesNotMatch(combined(ended.fr), activeClaimFr);
  assert.doesNotMatch(combined(ended.en), activeClaimEn);
});

test('open requests do not show a follow-state line or extra actions', () => {
  for (const status of ['pending', 'coach_accepted', 'declined', 'withdrawn'] as const) {
    assert.equal(requestRelationshipCopyKey(request(status, 'active'), client), null);
    assert.equal(requestRelationshipCopyKey(request(status, 'ended'), coach), null);
  }
  assert.deepEqual(requestActions(request('coach_accepted'), client), ['confirmed', 'withdrawn']);
  assert.deepEqual(requestActions(request('coach_accepted'), coach), []);
  assert.deepEqual(requestActions(request('pending'), client), ['withdrawn']);
  assert.deepEqual(requestActions(request('declined'), client), []);
  assert.deepEqual(requestActions(request('withdrawn'), client), []);
});

test('request identifiers survive retries but remain isolated per account and coach', () => {
 const map = new Map<string,string>();
 const storage = { getItem:(key:string)=>map.get(key)??null, setItem:(key:string,value:string)=>{map.set(key,value);}, removeItem:(key:string)=>{map.delete(key);} };
 const first=coachingRequestKey(storage,'A','coach');
 assert.equal(coachingRequestKey(storage,'A','coach'),first);
 assert.notEqual(coachingRequestKey(storage,'B','coach'),first);
 assert.notEqual(coachingRequestKey(storage,'A','other'),first);
 clearCoachingRequestKey(storage,'A','coach');
 assert.notEqual(coachingRequestKey(storage,'A','coach'),first);
});

test('disabled browser storage keeps a retry key and cannot turn success into cleanup failure', () => {
 const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
 const first=coachingRequestKey(storage,'no-storage','coach');
 assert.equal(coachingRequestKey(storage,'no-storage','coach'),first);
 assert.doesNotThrow(()=>clearCoachingRequestKey(storage,'no-storage','coach'));
});

test('report identifiers survive retries, clear only after success, and isolate per target', () => {
 const map = new Map<string,string>();
 const storage = { getItem:(key:string)=>map.get(key)??null, setItem:(key:string,value:string)=>{map.set(key,value);}, removeItem:(key:string)=>{map.delete(key);} };
 const first=coachingReportKey(storage,'A','target','req');
 assert.equal(coachingReportKey(storage,'A','target','req'),first);
 assert.notEqual(coachingReportKey(storage,'B','target','req'),first);
 assert.notEqual(coachingReportKey(storage,'A','other','req'),first);
 assert.notEqual(coachingReportKey(storage,'A','target',null),first);
 clearCoachingReportKey(storage,'A','target','req');
 assert.notEqual(coachingReportKey(storage,'A','target','req'),first);
});

test('disabled browser storage keeps a report retry key and cannot turn success into cleanup failure', () => {
 const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
 const first=coachingReportKey(storage,'no-storage','target',null);
 assert.equal(coachingReportKey(storage,'no-storage','target',null),first);
 assert.doesNotThrow(()=>clearCoachingReportKey(storage,'no-storage','target',null));
});

test('comparison accepts at most three unique profile identifiers, never arbitrary query fragments', () => {
 const ids=[1,2,3,4].map(n=>`a1780000-0000-4000-8000-00000000000${n}`);
 assert.deepEqual(comparisonIds(new URLSearchParams({compare:[ids[0],ids[0],'invalid',...ids.slice(1)].join(',')})),ids.slice(0,3));
});
