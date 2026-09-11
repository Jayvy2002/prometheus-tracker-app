import { supabase } from './supabase';
import { parseCoachQuestionnaire, type CoachQuestionnaire, type QuestionnaireAnswer } from './coachQuestionnaire';
export interface QuestionnaireVersion { id: string; definition: CoachQuestionnaire }
export interface QuestionnaireResponse {
 id: string; version_id: string; client_id: string; coach_id: string | null;
 answers: Record<string, QuestionnaireAnswer>; revision: number; completed_at: string | null;
}
function version(row: { id: string; definition: unknown }): QuestionnaireVersion {
 const parsed = parseCoachQuestionnaire(row.definition);
 if (!parsed.ok) throw new Error('invalid_questionnaire');
 return { id: row.id, definition: parsed.value };
}
export async function listQuestionnaires(coachId: string) {
 const {data,error}=await supabase.from('coach_questionnaire_versions').select('id,definition').eq('coach_id',coachId).order('version',{ascending:false});
 if(error) throw error;
 return (data ?? []).map(version);
}
export async function publishQuestionnaire(definition: CoachQuestionnaire) {
 const parsed=parseCoachQuestionnaire(definition);
 if(!parsed.ok) throw new Error('invalid_questionnaire');
 const {data,error}=await supabase.from('coach_questionnaire_versions').insert({
  coach_id:definition.coachId,questionnaire_id:definition.id,version:definition.version,definition:parsed.value,
 }).select('id,definition').single();
 if(error) throw error;
 return version(data);
}
export async function setDefaultQuestionnaire(coachId: string, versionId: string | null) {
 const result=versionId
  ? await supabase.from('coach_questionnaire_defaults').upsert({coach_id:coachId,version_id:versionId})
  : await supabase.from('coach_questionnaire_defaults').delete().eq('coach_id',coachId);
 if(result.error) throw result.error;
}
export async function getDefaultQuestionnaire(coachId: string) {
 const {data,error}=await supabase.from('coach_questionnaire_defaults').select('version_id').eq('coach_id',coachId).maybeSingle();
 if(error) throw error;
 return data?.version_id as string | undefined;
}
export async function listQuestionnaireResponses(clientId: string) {
 const {data,error}=await supabase.from('client_questionnaire_responses').select('*').eq('client_id',clientId).order('created_at',{ascending:false});
 if(error) throw error;
 return (data ?? []) as QuestionnaireResponse[];
}
export async function getQuestionnaireVersion(id: string) {
 const {data,error}=await supabase.from('coach_questionnaire_versions').select('id,definition').eq('id',id).single();
 if(error) throw error;
 return version(data);
}
export async function saveQuestionnaireResponse(response: QuestionnaireResponse, answers: Record<string,QuestionnaireAnswer>, complete: boolean) {
 const {data,error}=await supabase.rpc('save_questionnaire_response',{p_id:response.id,p_revision:response.revision,p_answers:answers,p_complete:complete});
 if(error) throw error;
 return data as QuestionnaireResponse;
}
