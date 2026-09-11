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
 const email = name+'@example.test';
 const password = 'Only-local-test-'+crypto.randomUUID();
 const { user } = check(await admin.auth.admin.createUser({email,password,email_confirm:true}));
 check(await admin.from('user_roles').update({coaching_role:role}).eq('user_id',user.id));
 check(await admin.from('user_profiles').update({full_name:name,language:'en',onboarding_completed:role==='coach'}).eq('id',user.id));
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
 const page=await pageFor(coach);
 await page.goto(origin+'/coach/questionnaire');
 await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByLabel('Name (FR)',{exact:true}).fill('Accueil test');
 await page.getByLabel('Name (EN)',{exact:true}).fill('Test welcome');
 await page.getByRole('button',{name:'Add a question',exact:true}).click();
 await page.getByLabel('Question (FR)',{exact:true}).fill('Comment préfères-tu échanger ?');
 await page.getByLabel('Question (EN)',{exact:true}).fill('How do you prefer to communicate?');
 await page.getByLabel('Required',{exact:true}).check();
 await page.getByRole('button',{name:'Publish this version',exact:true}).click();
 await page.getByRole('button',{name:'Use for future invitations',exact:true}).click();
 const token='browser-test-'+crypto.randomUUID();
 check(await coach.client.from('coach_invites').insert({coach_id:coach.id,token,max_uses:1,expires_at:new Date(Date.now()+3600000).toISOString()}));
 const accepted=check(await athlete.client.rpc('accept_coach_invite',{p_token:token}));
 assert.equal(accepted.ok,true);
 const clientPage=await pageFor(athlete);
 await clientPage.goto(origin+'/dashboard');
 const answer=clientPage.getByLabel('How do you prefer to communicate?',{exact:false});
 await answer.fill('Messages in the morning');
 await clientPage.getByRole('button',{name:'Save draft',exact:true}).click();
 await clientPage.getByText('Draft saved',{exact:true}).waitFor();
 await clientPage.reload();
 assert.equal(await answer.inputValue(),'Messages in the morning');
 console.log('PASS: builder, invitation, assigned questionnaire, draft reload');
 // Publish revision two while the athlete keeps answering the first revision.
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Question (EN)',{exact:true}).fill('Updated question');
 await page.getByRole('button',{name:'Publish this version',exact:true}).click();
 await page.getByText(/v2/).first().waitFor();
 await clientPage.reload();
 assert.equal(await answer.inputValue(),'Messages in the morning');
 await clientPage.getByRole('button',{name:'Finish and send',exact:true}).click();
 await clientPage.goto(origin+'/questionnaire');
 await clientPage.getByText('Answers sent',{exact:true}).waitFor();
 assert.equal(await answer.isDisabled(),true);
 const responses=check(await athlete.client.from('client_questionnaire_responses').select('*'));
 assert.equal(responses.length,1);
 assert.ok(responses[0].completed_at);
 const denied=check(await other.client.from('client_questionnaire_responses').select('id'));
 assert.equal(denied.length,0);
 await page.goto(origin+'/clients/'+athlete.id);
 await page.getByText('Answers sent',{exact:true}).waitFor();
 console.log('PASS: pinned revision, finalization, read-only answers, coach review, other-coach isolation');
 await clientPage.screenshot({path:'artifacts/questionnaire/completed.png',fullPage:true});
} catch(error) {
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:'artifacts/questionnaire/failure-'+i+'.png',fullPage:true}).catch(()=>{});
 throw error;
} finally {
 await browser.close();
 vite.kill('SIGTERM');
}
