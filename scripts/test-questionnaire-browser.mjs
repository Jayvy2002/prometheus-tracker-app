import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

// This script refuses remote databases. Credentials never leave the ephemeral runner.
const config = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const url = config.API_URL;
assert.equal(new URL(url).hostname, '127.0.0.1', 'Only the local Supabase test instance is allowed');
const admin = createClient(url, config.SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const check = ({data,error}) => { if(error) throw error; return data; };
async function actor(name, role) {
 const email = name.toLowerCase().replaceAll(' ','-')+'@example.test';
 const password = 'Only-local-test-'+crypto.randomUUID();
 const { user } = check(await admin.auth.admin.createUser({email,password,email_confirm:true}));
 check(await admin.from('user_roles').update({coaching_role:role}).eq('user_id',user.id));
 check(await admin.from('user_profiles').update({
  full_name:name,
  language:'en',
  onboarding_completed:role==='coach',
  entry_intent:role==='coach'?'coach':'solo',
 }).eq('id',user.id));
 const client=createClient(url,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const { session }=check(await client.auth.signInWithPassword({email,password}));
 return {id:user.id,client,session};
}
const coach=await actor('Questionnaire Coach','coach');
const athlete=await actor('Questionnaire Athlete','none');
const other=await actor('Questionnaire Other','coach');
const vite=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4173'],{
 env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:config.ANON_KEY},
 stdio:'ignore'
});
const origin='http://127.0.0.1:4173';
const browser=await chromium.launch();
await mkdir('artifacts/questionnaire',{recursive:true});
const pages=[];
async function pageFor(actor) {
 const context=await browser.newContext({locale:'en-US'});
 const page=await context.newPage();
 pages.push(page);
 const key='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token';
 await context.addInitScript(({key,session})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session));
  localStorage.setItem('i18nextLng','en');
 },{key,session:actor.session});
 page.setDefaultTimeout(25000);
 return page;
}
try {
 for(let i=0;i<60;i++){
  if(await fetch(origin).then(r=>r.ok).catch(()=>false))break;
  if(i===59)throw new Error('Vite failed to start');
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 async function passIntentionIfShown(page,intent) {
  const choice=page.getByRole('button',{name:new RegExp(intent)});
  if(await choice.isVisible().catch(()=>false)){
   await choice.click();
   await choice.waitFor({state:'hidden'});
  }
 }
 const page=await pageFor(coach);
 await page.goto(origin+'/coach/questionnaire');
 await page.getByRole('button').first().waitFor();
 await passIntentionIfShown(page,'I am a coach');
 if(!page.url().includes('/coach/questionnaire'))await page.goto(origin+'/coach/questionnaire');
 await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByLabel('Name (FR)',{exact:true}).fill('Accueil test');
 await page.getByLabel('Name (EN)',{exact:true}).fill('Test welcome');
 await page.getByRole('button',{name:'Add a question',exact:true}).click();
 await page.getByLabel('Question (FR)',{exact:true}).fill('Comment préfères-tu échanger ?');
 await page.getByLabel('Question (EN)',{exact:true}).fill('How do you prefer to communicate?');
 await page.locator('summary').filter({hasText:'Advanced settings'}).click();
 await page.getByLabel('Required',{exact:true}).check();
 await page.getByRole('button',{name:'Publish this version',exact:true}).click();
 await page.getByRole('button',{name:'Use for future invitations',exact:true}).click();
 await page.getByText(/✓/).waitFor();
 const token='browser-test-'+crypto.randomUUID();
 check(await coach.client.from('coach_invites').insert({coach_id:coach.id,token,max_uses:1,expires_at:new Date(Date.now()+3600000).toISOString()}));
 const accepted=check(await athlete.client.rpc('accept_coach_invite',{
  p_token:token,p_consent_version:1,
  p_scopes:['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts'],
 }));
 assert.equal(accepted.ok,true);
 const clientPage=await pageFor(athlete);
 await clientPage.goto(origin+'/dashboard');
 await passIntentionIfShown(clientPage,'Train on my own');
 await clientPage.getByText('Questionnaire from your coach').waitFor();
 assert.equal(await clientPage.getByLabel('How do you prefer to communicate?',{exact:false}).count(),0,'incomplete questionnaire must not prison the home');
 await clientPage.goto(origin+'/messages');
 assert.equal(await clientPage.getByRole('button',{name:'Finish and send',exact:true}).count(),0,'messages stay reachable');
 await clientPage.goto(origin+'/questionnaire');
 await clientPage.getByTestId('questionnaire-summary').waitFor();
 await clientPage.getByTestId('questionnaire-edit-section_1').click();
 const answer=clientPage.getByLabel('How do you prefer to communicate?',{exact:false});
 await answer.fill('Messages in the morning');
 await clientPage.getByRole('button',{name:'Save draft',exact:true}).click();
 await clientPage.getByText('Draft saved',{exact:true}).waitFor();
 const savedRows=check(await athlete.client.from('client_questionnaire_responses').select('answers'));
 assert.deepEqual(Object.values(savedRows[0].answers),['Messages in the morning'],'Draft must be persisted before navigation');
 await clientPage.reload();
 await clientPage.getByTestId('questionnaire-summary').waitFor();
 await clientPage.getByText('Messages in the morning',{exact:true}).waitFor();
 await clientPage.getByTestId('questionnaire-edit-section_1').click();
 assert.equal(await answer.inputValue(),'Messages in the morning');
 console.log('PASS: builder, invitation, assigned questionnaire, draft reload');
 // Publish revision two while the athlete keeps answering the first revision.
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Question (EN)',{exact:true}).fill('Updated question');
 await page.getByRole('button',{name:'Publish this version',exact:true}).click();
 await page.getByText(/v2/).first().waitFor();
 await clientPage.reload();
 await clientPage.getByTestId('questionnaire-summary').waitFor();
 await clientPage.getByText('Messages in the morning',{exact:true}).waitFor();
 assert.ok(await clientPage.getByText('How do you prefer to communicate?').count(),'pinned revision keeps the original question');
 assert.equal(await clientPage.getByText('Updated question').count(),0,'v2 must not reset the in-progress response');
 await clientPage.getByRole('button',{name:'Finish and send',exact:true}).click();
 await clientPage.getByRole('button',{name:'Finish and send',exact:true}).waitFor({state:'hidden'});
 await clientPage.goto(origin+'/questionnaire');
 await clientPage.getByText('Answers sent',{exact:true}).waitFor();
 assert.equal(await clientPage.getByTestId('questionnaire-edit-section_1').count(),0,'completed answers stay on the summary');
 assert.equal(await clientPage.getByLabel('How do you prefer to communicate?',{exact:false}).count(),0,'completed answers are not a live form');
 const responses=check(await athlete.client.from('client_questionnaire_responses').select('*'));
 assert.equal(responses.length,1);
 assert.ok(responses[0].completed_at);
 const denied=check(await other.client.from('client_questionnaire_responses').select('id'));
 assert.equal(denied.length,0);
 await page.goto(origin+'/clients/'+athlete.id);
 await page.locator('summary').filter({hasText:/^Questionnaire$/}).click();
 await page.getByText('Answers sent',{exact:true}).waitFor();
 console.log('PASS: pinned revision, finalization, read-only answers, coach review, other-coach isolation');
 await clientPage.screenshot({path:'artifacts/questionnaire/completed.png',fullPage:true});
 // Independent marketplace actors: two simultaneous acceptances must never grant two accesses.
 const visitor=await actor('Directory Visitor','none');
 check(await admin.from('user_profiles').update({entry_intent:'find_coach',onboarding_completed:true}).eq('id',visitor.id));
 for(const [person,name] of [[coach,'Questionnaire Coach'],[other,'Questionnaire Other']]) {
  check(await person.client.rpc('save_my_coach_profile',{p_profile:{public_name:name,introduction:'A clear introduction to our coaching service.',method:'Regular conversations and shared planning.',offer:'Discuss your expectations before starting.',disciplines:['strength'],languages:['en'],formats:['online'],published:true,accepting_clients:true}}));
 }
 const directoryPage=await pageFor(visitor);
 await directoryPage.setViewportSize({width:390,height:844});
 await directoryPage.goto(origin+'/coaches');
 await directoryPage.getByRole('heading',{name:'Questionnaire Coach',exact:true}).waitFor();
 assert.equal(await directoryPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile directory must not overflow');
 await directoryPage.screenshot({path:'artifacts/questionnaire/directory-mobile.png',fullPage:true});
 await directoryPage.setViewportSize({width:1280,height:900});
 await directoryPage.screenshot({path:'artifacts/questionnaire/directory-desktop.png',fullPage:true});
 const requests=[];
 for(const person of [coach,other]) requests.push(check(await visitor.client.rpc('request_coaching',{p_coach:person.id,p_public_name:'Directory Visitor',p_summary:'I would like to learn how your service works.',p_sharing_version:2,p_request_key:crypto.randomUUID()})));
 const outcomes=await Promise.all([coach,other].map((person,index)=>person.client.rpc('respond_coaching_request',{p_request:requests[index].id,p_status:'accepted'})));
 assert.equal(outcomes.filter(result=>!result.error).length,1,'Only one concurrent acceptance may succeed');
 assert.equal(outcomes.find(result=>result.error).error.message,'request_closed');
 const winner=outcomes.findIndex(result=>!result.error);
 const links=check(await admin.from('coach_client_links').select('coach_id').eq('client_id',visitor.id).eq('status','active'));
 assert.equal(links.length,1);
 assert.equal(links[0].coach_id,[coach,other][winner].id);
 assert.equal(check(await visitor.client.rpc('client_end_coach_link')).ok,true);
 check(await [coach,other][winner].client.rpc('respond_coaching_request',{p_request:requests[winner].id,p_status:'accepted'}));
 assert.equal(check(await admin.from('coach_client_links').select('id').eq('client_id',visitor.id).eq('status','active')).length,0,'Retry cannot reactivate departed client');
 console.log('PASS: responsive directory, concurrent acceptance, departure and historical retry');
} catch(error) {
 for (const page of pages) {
  console.error('Local test page:', page.url(), await page.locator('body').innerText().catch(()=>'unavailable'));
 }
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:'artifacts/questionnaire/failure-'+i+'.png',fullPage:true}).catch(()=>{});
 throw error;
} finally {
 await browser.close();
 vite.kill('SIGTERM');
}
