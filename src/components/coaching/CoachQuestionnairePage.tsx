import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { QUESTION_TYPES, parseCoachQuestionnaire, type CoachQuestionnaire, type QuestionnaireQuestion } from '../../lib/coachQuestionnaire';
import { getDefaultQuestionnaire, listQuestionnaires, publishQuestionnaire, setDefaultQuestionnaire, type QuestionnaireVersion } from '../../lib/coachQuestionnaireApi';
import CoachQuestionnaireFields from '../onboarding/CoachQuestionnaireFields';
import Button from '../ui/Button';

export default function CoachQuestionnairePage() {
 const {user}=useAuthStore();
 const {t}=useTranslation();
 const [versions,setVersions]=useState<QuestionnaireVersion[]>([]);
 const [selected,setSelected]=useState<CoachQuestionnaire|null>(null);
 const [defaultId,setDefaultId]=useState<string|undefined>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [preview,setPreview]=useState(false);
 useEffect(()=>{
  let active=true;
  if(!user)return;
  setBusy(true);
  Promise.all([listQuestionnaires(user.id),getDefaultQuestionnaire(user.id)])
   .then(([v,d])=>{if(active){setVersions(v);setDefaultId(d);}})
   .catch(()=>{if(active)setError(t('coachQuestionnaire.loadError'));})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[user?.id,t]);
 const newDefinition=()=>{
  if(!user)return;
  setSelected({schemaVersion:1,id:crypto.randomUUID(),coachId:user.id,version:1,
   name:{fr:'',en:''},sections:[{id:'section_1',label:{fr:'Questions',en:'Questions'},questions:[]}]});
  setError('');
 };
 const question=():QuestionnaireQuestion=>({id:'custom_'+crypto.randomUUID(),type:'text',label:{fr:'',en:''},required:false,medical:false});
 const mutate=(fn:(d:CoachQuestionnaire)=>void)=>{
  if(!selected)return;const next=structuredClone(selected);fn(next);setSelected(next);setError('');
 };
 const publish=async()=>{
  if(!selected||busy)return;
  const parsed=parseCoachQuestionnaire(selected);
  if(!parsed.ok){setError(t('coachQuestionnaire.invalidDefinition'));return;}
  setBusy(true);setError('');
  try{const row=await publishQuestionnaire(parsed.value);setVersions(v=>[row,...v]);setSelected(null);}
  catch{setError(t('coachQuestionnaire.saveError'));}
  finally{setBusy(false);}
 };
 const chooseDefault=async(id:string|null)=>{
  if(!user||busy)return;setBusy(true);setError('');
  try{await setDefaultQuestionnaire(user.id,id);setDefaultId(id??undefined);}
  catch{setError(t('coachQuestionnaire.saveError'));}
  finally{setBusy(false);}
 };
 const input='w-full p-2 rounded border border-neutral-700 bg-neutral-900 text-white';
 return <div className="p-4 pb-28 space-y-4">
  <h1 className="text-xl font-bold">{t('coachQuestionnaire.title')}</h1>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  {!selected ? <>
   <Button onClick={newDefinition} disabled={busy}>{t('common.add')}</Button>
   <Button onClick={()=>void chooseDefault(null)} disabled={busy}>{t('coachQuestionnaire.standard')}</Button>
   {versions.map(v=><div key={v.id} className="border border-neutral-800 rounded p-3 space-y-2">
    <p>{v.definition.name.fr} / {v.definition.name.en} · v{v.definition.version}{defaultId===v.id?' ✓':''}</p>
    <Button disabled={busy} onClick={()=>{const d=structuredClone(v.definition);d.version=Math.max(...versions.filter(x=>x.definition.id===d.id).map(x=>x.definition.version))+1;setSelected(d);}}>{t('common.edit')}</Button>
    <Button disabled={busy} onClick={()=>{const d=structuredClone(v.definition);d.id=crypto.randomUUID();d.version=1;setSelected(d);}}>{t('coachQuestionnaire.duplicate')}</Button>
    <Button disabled={busy} onClick={()=>void chooseDefault(v.id)}>{t('coachQuestionnaire.useDefault')}</Button>
   </div>)}
  </> : <fieldset disabled={busy} className="space-y-4">
   {(['fr','en'] as const).map(lang=><label key={lang} className="block">{t('coachQuestionnaire.name')} ({lang.toUpperCase()})
    <input className={input} value={selected.name[lang]} onChange={e=>mutate(d=>{d.name[lang]=e.target.value;})}/>
   </label>)}
   {selected.sections.map((section,si)=><section key={section.id} className="border border-neutral-700 rounded p-3 space-y-3">
    {(['fr','en'] as const).map(lang=><label key={lang} className="block">{t('coachQuestionnaire.section')} ({lang.toUpperCase()})
     <input className={input} value={section.label[lang]} onChange={e=>mutate(d=>{d.sections[si].label[lang]=e.target.value;})}/>
    </label>)}
    {section.questions.map((q,qi)=><div key={q.id} className="p-3 border border-neutral-800 rounded space-y-2">
     {(['fr','en'] as const).map(lang=><label key={lang} className="block">{t('coachQuestionnaire.question')} ({lang.toUpperCase()})
      <input className={input} value={q.label[lang]} onChange={e=>mutate(d=>{d.sections[si].questions[qi].label[lang]=e.target.value;})}/>
     </label>)}
     <label className="block">{t('coachQuestionnaire.type')}<select className={input} value={q.type} onChange={e=>mutate(d=>{
      const item=d.sections[si].questions[qi];item.type=e.target.value as QuestionnaireQuestion['type'];
      if(item.type==='single'||item.type==='multi')item.options??=[{id:'a',label:{fr:'',en:''}},{id:'b',label:{fr:'',en:''}}];else delete item.options;
     })}>{QUESTION_TYPES.map(type=><option key={type} value={type}>{t('coachQuestionnaire.types.'+type)}</option>)}</select></label>
     {q.options?.map((option,oi)=><div key={option.id} className="flex gap-2">
      {(['fr','en'] as const).map(lang=><label key={lang}>{t('coachQuestionnaire.option')} {oi+1} ({lang.toUpperCase()})
       <input className={input} value={option.label[lang]} onChange={e=>mutate(d=>{d.sections[si].questions[qi].options![oi].label[lang]=e.target.value;})}/>
      </label>)}
      <button type="button" onClick={()=>mutate(d=>{d.sections[si].questions[qi].options!.splice(oi,1);})}>{t('common.delete')}</button>
     </div>)}
     {q.options&&<button type="button" onClick={()=>mutate(d=>{d.sections[si].questions[qi].options!.push({id:crypto.randomUUID(),label:{fr:'',en:''}});})}>{t('coachQuestionnaire.addOption')}</button>}
     <label className="block"><input type="checkbox" checked={q.required} onChange={e=>mutate(d=>{d.sections[si].questions[qi].required=e.target.checked;})}/>{t('coachQuestionnaire.mandatory')}</label>
     <label className="block"><input type="checkbox" checked={q.medical} onChange={e=>mutate(d=>{d.sections[si].questions[qi].medical=e.target.checked;})}/>{t('coachQuestionnaire.medical')}</label>
     <button type="button" disabled={qi===0} onClick={()=>mutate(d=>{const qs=d.sections[si].questions;[qs[qi-1],qs[qi]]=[qs[qi],qs[qi-1]];})}>{t('coachQuestionnaire.up')}</button>
     <button type="button" disabled={qi===section.questions.length-1} onClick={()=>mutate(d=>{const qs=d.sections[si].questions;[qs[qi],qs[qi+1]]=[qs[qi+1],qs[qi]];})}>{t('coachQuestionnaire.down')}</button>
     <button type="button" onClick={()=>mutate(d=>{d.sections[si].questions.splice(qi,1);})}>{t('common.delete')}</button>
    </div>)}
    <Button onClick={()=>mutate(d=>{d.sections[si].questions.push(question());})}>{t('coachQuestionnaire.addQuestion')}</Button>
    <button type="button" disabled={si===0} onClick={()=>mutate(d=>{[d.sections[si-1],d.sections[si]]=[d.sections[si],d.sections[si-1]];})}>{t('coachQuestionnaire.up')}</button>
    <button type="button" onClick={()=>mutate(d=>{d.sections.splice(si,1);})}>{t('common.delete')}</button>
   </section>)}
   <Button onClick={()=>mutate(d=>{d.sections.push({id:crypto.randomUUID(),label:{fr:'',en:''},questions:[]});})}>{t('coachQuestionnaire.addSection')}</Button>
   <Button onClick={()=>setPreview(v=>!v)}>{t('coachQuestionnaire.preview')}</Button>
   {preview&&<CoachQuestionnaireFields definition={selected} answers={{}} onChange={()=>undefined} disabled/>}
   <Button onClick={()=>void publish()} loading={busy}>{t('coachQuestionnaire.publish')}</Button>
   <Button onClick={()=>setSelected(null)}>{t('common.cancel')}</Button>
  </fieldset>}
 </div>;
}
