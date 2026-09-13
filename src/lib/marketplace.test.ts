import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketFilters, matchingReasons, requestActions, type CoachPublicProfile, type CoachingRequest } from './marketplace';
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
 assert.deepEqual(requestActions({...row,status:'accepted'},'coach'),[]);
 assert.deepEqual(requestActions({...row,status:'accepted'},'client'),['withdrawn']);
 assert.deepEqual(requestActions({...row,status:'withdrawn'},'client'),[]);
});
