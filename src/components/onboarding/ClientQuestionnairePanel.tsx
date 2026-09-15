import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { getQuestionnaireVersion, listQuestionnaireResponses, saveQuestionnaireResponse, type QuestionnaireResponse } from '../../lib/coachQuestionnaireApi';
import { validateQuestionnaireAnswers, type CoachQuestionnaire, type QuestionnaireAnswer, type QuestionnaireIssue } from '../../lib/coachQuestionnaire';
import CoachQuestionnaireFields from './CoachQuestionnaireFields';
import { track } from '../../lib/telemetryClient';
import { useCoachingStore } from '../../stores/coachingStore';
import Button from '../ui/Button';

function ResponseForm({initial,readOnly,onCompleted}:{initial:QuestionnaireResponse;readOnly:boolean;onCompleted?:()=>void}) {
 const {t,i18n}=useTranslation();
 const [response,setResponse]=useState(initial);
 const [definition,setDefinition]=useState<CoachQuestionnaire|null>(null);
 const [answers,setAnswers]=useState<Record<string,QuestionnaireAnswer>>(initial.answers);
 const [issues,setIssues]=useState<QuestionnaireIssue[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 const [retry,setRetry]=useState(0);
 const inFlight=useRef(false);
 const dirty=JSON.stringify(answers)!==JSON.stringify(response.answers);
 // A response can be refreshed in place after navigation or an auth-store reload.
 // Keep the form bound to the newest server revision instead of retaining stale local state.
 useEffect(()=>{
  setResponse(initial);
  setAnswers(initial.answers ?? {});
  setIssues([]);
  setSaved(false);
 },[initial.id,initial.revision,initial.completed_at,initial.answers]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 useEffect(()=>{
  let active=true;
  setError('');
  getQuestionnaireVersion(initial.version_id).then(v=>{if(active)setDefinition(v.definition);})
   .catch(()=>{if(active)setError('coachQuestionnaire.loadError');});
  return()=>{active=false;};
 },[initial.version_id,retry]);
 const save=async(complete:boolean)=>{
  if(!definition||inFlight.current||readOnly||response.completed_at)return;
  const problems=validateQuestionnaireAnswers(definition,answers,complete);
  setIssues(problems);if(problems.length)return;
  inFlight.current=true;setBusy(true);setError('');setSaved(false);
  try{
   const next=await saveQuestionnaireResponse(response,answers,complete);
   setResponse(next);setSaved(true);
   if(complete){
    track('intake_completed',{questionnaire_id:definition.id,questionnaire_version:definition.version,revisit:false,targets_computed:false});
    onCompleted?.();
   }
  }
  catch{setError('coachQuestionnaire.saveError');}
  finally{inFlight.current=false;setBusy(false);}
 };
 return <section className="border border-neutral-800 rounded-xl p-4 space-y-3">
  {error&&<div role="alert" className="text-red-400"><p>{t(error)}</p>
   {!definition&&<Button onClick={()=>setRetry(n=>n+1)}>{t('errors.retry')}</Button>}
  </div>}
  {!definition&&!error&&<p role="status">{t('common.loading')}</p>}
  {definition&&<>
   <h2 className="font-semibold">{definition.name[i18n.language.startsWith('fr')?'fr':'en']} · v{definition.version}</h2>
   <CoachQuestionnaireFields definition={definition} answers={answers}
    onChange={v=>{setAnswers(v);setSaved(false);}}
    issues={issues} disabled={readOnly||busy||!!response.completed_at}/>
   {!readOnly&&!response.completed_at&&<div className="flex gap-2">
    <Button onClick={()=>void save(false)} loading={busy}>{t('coachQuestionnaire.saveDraft')}</Button>
    <Button onClick={()=>void save(true)} disabled={busy}>{t('coachQuestionnaire.submit')}</Button>
   </div>}
   {(saved||response.completed_at)&&<p role="status">{t(response.completed_at?'coachQuestionnaire.completed':'coachQuestionnaire.saved')}</p>}
  </>}
 </section>;
}
export default function ClientQuestionnairePanel({clientId,responseId,onCompleted,emptyFallback}:{clientId?:string;responseId?:string;onCompleted?:()=>void;emptyFallback?:ReactNode}) {
 const {user}=useAuthStore();
 const myCoach=useCoachingStore(s=>s.myCoach);
 const {t}=useTranslation();
 const owner=clientId??user?.id;
 const viewingOwn=!clientId||clientId===user?.id;
 const [responses,setResponses]=useState<QuestionnaireResponse[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  setResponses([]);setError('');setLoading(true);
  if(!owner)return()=>{active=false;};
  listQuestionnaireResponses(owner).then(rows=>{if(active)setResponses(rows);})
   .catch(()=>{if(active)setError('coachQuestionnaire.loadError');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[owner,user?.id,retry]);
 if(!loading&&!error&&!responses.length&&emptyFallback!==undefined)return <>{emptyFallback}</>;
 return <div className="space-y-4">
  <h1 className="text-xl font-semibold">{t(viewingOwn?'coachQuestionnaire.myTitle':'coachQuestionnaire.title')}</h1>
  {loading&&<p role="status">{t('common.loading')}</p>}
  {error&&<div role="alert"><p>{t(error)}</p><Button onClick={()=>setRetry(v=>v+1)}>{t('errors.retry')}</Button></div>}
  {!loading&&!error&&!responses.length&&<p>{t('coachQuestionnaire.empty')}</p>}
  {responses.filter(r=>!responseId||r.id===responseId).map(r=><ResponseForm key={r.id} initial={r}
   readOnly={(!!clientId&&clientId!==user?.id)||(!clientId&&r.coach_id!==myCoach?.id)}
   onCompleted={onCompleted}/>)} 
 </div>;
}
