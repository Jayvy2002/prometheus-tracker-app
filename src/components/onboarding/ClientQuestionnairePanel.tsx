import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { getQuestionnaireVersion, listQuestionnaireResponses, saveQuestionnaireResponse, type QuestionnaireResponse } from '../../lib/coachQuestionnaireApi';
import { validateQuestionnaireAnswers, type CoachQuestionnaire, type QuestionnaireAnswer, type QuestionnaireIssue } from '../../lib/coachQuestionnaire';
import CoachQuestionnaireFields from './CoachQuestionnaireFields';
import Button from '../ui/Button';

function ResponseForm({initial,readOnly}:{initial:QuestionnaireResponse;readOnly:boolean}) {
 const {t,i18n}=useTranslation();
 const [response,setResponse]=useState(initial);
 const [definition,setDefinition]=useState<CoachQuestionnaire|null>(null);
 const [answers,setAnswers]=useState<Record<string,QuestionnaireAnswer>>(initial.answers);
 const [issues,setIssues]=useState<QuestionnaireIssue[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 useEffect(()=>{
  let active=true;
  getQuestionnaireVersion(initial.version_id).then(v=>{if(active)setDefinition(v.definition);})
   .catch(()=>{if(active)setError(t('coachQuestionnaire.loadError'));});
  return()=>{active=false;};
 },[initial.version_id,t]);
 const save=async(complete:boolean)=>{
  if(!definition||busy)return;
  const problems=validateQuestionnaireAnswers(definition,answers,complete);
  setIssues(problems);if(problems.length)return;
  setBusy(true);setError('');setSaved(false);
  try{const next=await saveQuestionnaireResponse(response,answers,complete);setResponse(next);setSaved(true);}
  catch{setError(t('coachQuestionnaire.saveError'));}
  finally{setBusy(false);}
 };
 return <section className="border border-neutral-800 rounded-xl p-4 space-y-3">
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  {definition&&<>
   <h2 className="font-semibold">{definition.name[i18n.language.startsWith('fr')?'fr':'en']} · v{definition.version}</h2>
   <p className="text-sm text-neutral-400">{t('coachQuestionnaire.audience')}</p>
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
export default function ClientQuestionnairePanel({clientId}:{clientId?:string}) {
 const {user}=useAuthStore();
 const {t}=useTranslation();
 const owner=clientId??user?.id;
 const [responses,setResponses]=useState<QuestionnaireResponse[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  setResponses([]);setError('');setLoading(true);
  if(!owner)return()=>{active=false;};
  listQuestionnaireResponses(owner).then(rows=>{if(active)setResponses(rows);})
   .catch(()=>{if(active)setError(t('coachQuestionnaire.loadError'));})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[owner,user?.id,t,retry]);
 return <div className="space-y-4">
  <h1 className="text-xl font-semibold">{t('coachQuestionnaire.title')}</h1>
  {loading&&<p role="status">{t('common.loading')}</p>}
  {error&&<div role="alert"><p>{error}</p><Button onClick={()=>setRetry(v=>v+1)}>{t('errors.retry')}</Button></div>}
  {!loading&&!error&&!responses.length&&<p>{t('coachQuestionnaire.empty')}</p>}
  {responses.map(r=><ResponseForm key={r.id} initial={r} readOnly={!!clientId&&clientId!==user?.id}/>)}
 </div>;
}
