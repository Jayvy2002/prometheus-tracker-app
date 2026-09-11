import test from 'node:test';
import assert from 'node:assert/strict';
import { compactQuestionnaireContext, fetchQuestionnaireContext } from '../../supabase/functions/_shared/questionnaireContext';

const definition = {
 id:'q', version:1, sections:[{questions:[
  {id:'custom_contact',type:'single',label:{fr:'Contact',en:'Contact'},options:[
   {id:'morning',label:{fr:'Matin',en:'Morning'}},{id:'evening',label:{fr:'Soir',en:'Evening'}}
  ]},
  {id:'custom_note',type:'text',label:{fr:'Note',en:'Note'},medical:true},
  {id:'custom_consent',type:'yes_no',label:{fr:'Accord',en:'Agreement'}}
 ]}]
};
test('context uses pinned bilingual labels and retains false without interpreting medical answers',()=>{
 const result=compactQuestionnaireContext(definition,{custom_contact:'morning',custom_note:'Context only',custom_consent:false,secret:'not a question'});
 assert.equal(result.version,1);
 assert.equal(result.answers.length,3);
 assert.deepEqual(result.answers[0].answer,[{id:'morning',label:{fr:'Matin',en:'Morning'}}]);
 assert.equal(result.answers[1].medical,true);
 assert.equal(result.answers[2].answer,false);
 assert.ok(!JSON.stringify(result).includes('not a question'));
 assert.ok(!Object.hasOwn(result,'intake'));
});
test('context has a bounded payload and explicit omissions',()=>{
 const questions=Array.from({length:100},(_,i)=>({id:'custom_'+i,type:'text',label:{fr:'Q',en:'Q'}}));
 const answers=Object.fromEntries(questions.map(q=>[q.id,'x'.repeat(10000)]));
 const result=compactQuestionnaireContext({sections:[{questions}]},answers);
 assert.ok(JSON.stringify(result).length<12500);
 assert.ok(result.omitted>0);
});

function mock(results: unknown[]) {
 const calls: Array<[string,...unknown[]]>=[];
 const admin={from(table:string){
  calls.push(['from',table]);
  const chain:Record<string,unknown>={};
  for(const method of ['select','eq','not','order','limit']){
   chain[method]=(...args:unknown[])=>{calls.push([method,...args]);return chain;};
  }
  for(const method of ['single','maybeSingle']) chain[method]=()=>Promise.resolve(results.shift());
  return chain;
 }};
 return {admin:admin as unknown as Parameters<typeof fetchQuestionnaireContext>[0],calls};
}
test('service role context stops before reading answers when relationship is absent',async()=>{
 const {admin,calls}=mock([{data:null,error:null}]);
 assert.equal(await fetchQuestionnaireContext(admin,'coach','client'),null);
 assert.deepEqual(calls.filter(c=>c[0]==='from'),[['from','coach_client_links']]);
});
test('context filters both participants, completed responses and the pinned definition',async()=>{
 const {admin,calls}=mock([
  {data:{id:'link'},error:null},
  {data:{version_id:'pinned',answers:{custom_consent:false}},error:null},
  {data:{definition},error:null}
 ]);
 const result=await fetchQuestionnaireContext(admin,'coach','client');
 assert.equal(result?.answers[0].answer,false);
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['not','completed_at','is',null])));
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','id','pinned'])));
 assert.equal(calls.filter(c=>c[0]==='eq'&&c[1]==='coach_id'&&c[2]==='coach').length,3);
});
test('unavailable questionnaire data fails visibly instead of silently omitting it',async()=>{
 const {admin}=mock([{data:{id:'link'},error:null},{data:null,error:{message:'unavailable'}}]);
 await assert.rejects(fetchQuestionnaireContext(admin,'coach','client'),/questionnaire_context_unavailable/);
 const solo=mock([]);
 assert.equal(await fetchQuestionnaireContext(solo.admin,'solo','solo'),null);
 assert.equal(solo.calls.length,0);
});
