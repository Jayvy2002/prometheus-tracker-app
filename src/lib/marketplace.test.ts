import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coachingRequestKey, clearCoachingRequestKey, marketFilters, matchingReasons, requestActions, type CoachPublicProfile, type CoachingRequest } from './marketplace';
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
