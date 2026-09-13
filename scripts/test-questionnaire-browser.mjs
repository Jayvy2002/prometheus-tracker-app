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
 check(await admin.from('user_profiles').update({full_name:name,language:'en',onboarding_completed:role==='coach'}).eq('id',user.id));
 const client=createClient(url,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const { session }=check(await client.auth.signInWithPassword({email,password}));
 return {id:user.id,client,session,email,password};
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
const authStorageKey='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token';
async function pageFor(actor) {
 const context=await browser.newContext({locale:'en-US'});
 const page=await context.newPage();
 pages.push(page);
 const key=authStorageKey;
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
 await page.goto(origin+'/dashboard');
 const personalWorkspace=page.getByRole('button',{name:'Personal',exact:true}).first();
 const coachingWorkspace=page.getByRole('button',{name:'Coaching',exact:true}).first();
 await coachingWorkspace.waitFor();
 assert.equal(await coachingWorkspace.getAttribute('aria-pressed'),'true');
 await personalWorkspace.click();
 await page.waitForURL('**/dashboard');
 assert.equal(await personalWorkspace.getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:'Clients',exact:true}).count(),0,'Personal workspace hides coach navigation');
 await page.goto(origin+'/workout');
 await page.waitForURL('**/workout');
 assert.equal(await personalWorkspace.getAttribute('aria-pressed'),'true','Coach can open their own workout tools');
 await page.reload();
 assert.equal(await personalWorkspace.getAttribute('aria-pressed'),'true','Workspace survives reload');

 await page.evaluate(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:authStorageKey,session:other.session});
 await page.reload();
 await coachingWorkspace.waitFor();
 assert.equal(await coachingWorkspace.getAttribute('aria-pressed'),'true','Another coach gets their own default');
 await personalWorkspace.click();
 assert.equal(await personalWorkspace.getAttribute('aria-pressed'),'true');

 await page.evaluate(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:authStorageKey,session:coach.session});
 await page.reload();
 await personalWorkspace.waitFor();
 assert.equal(await personalWorkspace.getAttribute('aria-pressed'),'true','Returning account recovers only its own preference');
 await coachingWorkspace.click();
 await page.waitForURL('**/dashboard');
 await page.screenshot({path:'artifacts/questionnaire/account-workspaces.png',fullPage:true});
 console.log('PASS: coach Personal/Coaching navigation, reload and account-isolated preference');

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
 await page.getByText(/✓/).waitFor();
 const token='browser-test-'+crypto.randomUUID();
 check(await coach.client.from('coach_invites').insert({coach_id:coach.id,token,max_uses:1,expires_at:new Date(Date.now()+3600000).toISOString()}));
 const accepted=check(await athlete.client.rpc('accept_coach_invite',{p_token:token}));
 assert.equal(accepted.ok,true);
 const clientPage=await pageFor(athlete);
 await clientPage.goto(origin+'/dashboard');
 await clientPage.evaluate(()=>navigator.serviceWorker.ready);
 await clientPage.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const answer=clientPage.getByLabel('How do you prefer to communicate?',{exact:false});
 await answer.fill('Messages in the morning');
 await clientPage.getByRole('button',{name:'Save draft',exact:true}).click();
 await clientPage.getByText('Draft saved',{exact:true}).waitFor();
 const savedRows=check(await athlete.client.from('client_questionnaire_responses').select('answers'));
 assert.deepEqual(Object.values(savedRows[0].answers),['Messages in the morning'],'Draft must be persisted before navigation');
 await clientPage.reload();
 await clientPage.waitForFunction(()=>Array.from(document.querySelectorAll('textarea')).some(input=>input.value==='Messages in the morning'));
 assert.equal(await answer.inputValue(),'Messages in the morning');
 console.log('PASS: builder, invitation, assigned questionnaire, draft reload');
 // Publish revision two while the athlete keeps answering the first revision.
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Question (EN)',{exact:true}).fill('Updated question');
 await page.getByRole('button',{name:'Publish this version',exact:true}).click();
 await page.getByText(/v2/).first().waitFor();
 await clientPage.reload();
 await clientPage.waitForFunction(()=>Array.from(document.querySelectorAll('textarea')).some(input=>input.value==='Messages in the morning'));
 assert.equal(await answer.inputValue(),'Messages in the morning');
 await clientPage.getByRole('button',{name:'Finish and send',exact:true}).click();
 await clientPage.getByRole('button',{name:'Finish and send',exact:true}).waitFor({state:'hidden'});
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
 // Private dossier content is removed while access cannot be verified.
 await page.route('**/rest/v1/coach_client_links?*', route => route.fulfill({
   status:503,contentType:'application/json',body:JSON.stringify({message:'injected access outage'})
 }));
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.getByText('Unable to verify access. Reconnect and try again.',{exact:true}).waitFor();
 assert.equal(await page.getByText('Answers sent',{exact:true}).count(),0);
 await page.unroute('**/rest/v1/coach_client_links?*');
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.getByText('Answers sent',{exact:true}).waitFor();

 await clientPage.screenshot({path:'artifacts/questionnaire/completed.png',fullPage:true});

 // Departure must succeed even if the subsequent profile refresh fails.
 await clientPage.goto(origin+'/profile');
 await clientPage.getByRole('button',{name:'End coaching relationship',exact:true}).click();
 const confirm=clientPage.getByRole('button',{name:'End relationship',exact:true});
 await confirm.waitFor();
 let departureCalls=0;
 await clientPage.route('**/rest/v1/rpc/client_end_coach_link',async route=>{
  departureCalls++;
  const response=await route.fetch();
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.ok(Number.isFinite(Date.parse(body.ended_at)),'Departure returns the persisted date');
  await route.fulfill({response,json:body});
 });
 await clientPage.route('**/rest/v1/user_profiles?*',route=>route.fulfill({
  status:503,contentType:'application/json',body:JSON.stringify({message:'injected refresh outage'})
 }));
 await confirm.click();
 await clientPage.waitForURL('**/dashboard');
 await clientPage.getByText('Your coaching relationship has ended',{exact:true}).waitFor();
 assert.equal(departureCalls,1,'Departure is submitted once');
 const ended=check(await admin.from('coach_client_links').select('status').eq('client_id',athlete.id).single());
 assert.equal(ended.status,'ended');
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.getByText('This coaching relationship has ended. The personal file is no longer accessible.',{exact:true}).waitFor();
 assert.equal(await page.getByText('Answers sent',{exact:true}).count(),0);
 console.log('PASS: open coach dossier closes on access failure and after client departure');

 const role=check(await admin.from('user_roles').select('coaching_role').eq('user_id',athlete.id).single());
 assert.equal(role.coaching_role,'none');
 const archivedAnswers=check(await athlete.client.from('client_questionnaire_responses').select('id'));
 assert.equal(archivedAnswers.length,1,'Client retains their answers');
 await clientPage.unroute('**/rest/v1/user_profiles?*');
 await clientPage.reload();
 await clientPage.getByText('Your coaching relationship has ended',{exact:true}).waitFor();

 await page.goto(origin+'/dashboard');
 await page.getByText('Questionnaire Athlete ended the coaching relationship.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Mark the departure of Questionnaire Athlete as read',exact:true}).click();
 await page.getByText('Questionnaire Athlete ended the coaching relationship.',{exact:true}).waitFor({state:'hidden'});
 await page.reload();
 const notices=check(await coach.client.from('coach_relationship_notices').select('read_at').eq('client_id',athlete.id));
 assert.equal(notices.length,1);
 assert.ok(notices[0].read_at);
 console.log('PASS: browser departure, refresh outage, solo reload, coach notice and persisted acknowledgement');
 const cachedUrls=await clientPage.evaluate(async()=>{
  const keys=await caches.keys();
  return (await Promise.all(keys.map(async key=>(await (await caches.open(key)).keys()).map(request=>request.url)))).flat();
 });
 assert.ok(cachedUrls.every(url=>new URL(url).origin===origin&&!url.includes('/rest/')&&!url.includes('/auth/')),'No private API response is stored by the worker');
 console.log('PASS: active service worker excludes all private API responses');
 // Independent requests exercise the database lock rather than the UI click guard.
 const rejoinToken='departure-rejoin-'+crypto.randomUUID();
 check(await coach.client.from('coach_invites').insert({coach_id:coach.id,token:rejoinToken,max_uses:1,expires_at:new Date(Date.now()+3600000).toISOString()}));
 assert.equal(check(await athlete.client.rpc('accept_coach_invite',{p_token:rejoinToken})).ok,true);
 const attempts=await Promise.all([
   athlete.client.rpc('client_end_coach_link'),
   athlete.client.rpc('client_end_coach_link'),
 ]);
 const results=attempts.map(check);
 assert.equal(results.filter(row=>row.ok===true).length,1);
 assert.equal(results.filter(row=>row.error==='not_linked').length,1);
 const afterRace=check(await coach.client.from('coach_relationship_notices').select('id').eq('client_id',athlete.id));
 assert.equal(afterRace.length,2,'One notice for each real departure, none for repeated calls');
 console.log('PASS: concurrent departures serialize, rejoining preserves the client and notices are not duplicated');


 // Execute the real store with a delayed RPC to check session isolation and the local lock.
 for (const mutation of ['departure','invitation']) {
 const isolation=await clientPage.evaluate(async mutation=>{
  const {useCoachingStore}=await import('/src/stores/coachingStore.ts');
  const {supabase}=await import('/src/lib/supabase.ts');
  const {setSessionOwner,getSessionOwner}=await import('/src/lib/sessionScope.ts');
  const originalRpc=supabase.rpc;
  const originalGetUser=supabase.auth.getUser;
  const owner=getSessionOwner();
  let release;
  let markStarted;
  const started=new Promise(resolve=>{markStarted=resolve;});
  try {
    useCoachingStore.getState().clear();
    setSessionOwner('departure-test-A');
    useCoachingStore.setState({coachingRole:'client',myCoach:{id:'coach-A',full_name:'Coach A',avatar_url:''}});
    supabase.auth.getUser=async()=>({data:{user:{id:'departure-test-A'}},error:null});
    supabase.rpc=()=>new Promise(resolve=>{release=resolve;markStarted();});
    const act=()=>mutation==='departure'
      ? useCoachingStore.getState().endMyCoachLink()
      : useCoachingStore.getState().acceptInvite('synthetic-invitation');
    const first=act();
    await started;
    const second=await act();
    useCoachingStore.getState().clear();
    setSessionOwner('departure-test-B');
    useCoachingStore.setState({coachingRole:'coach',myCoach:{id:'coach-B',full_name:'Coach B',avatar_url:''}});
    release({data:{ok:true,ended_at:new Date().toISOString(),coach_id:'coach-A',coach_name:'Coach A'},error:null});
    const oldResult=await first;
    return {secondError:second.error,oldError:oldResult.error,role:useCoachingStore.getState().coachingRole,coach:useCoachingStore.getState().myCoach?.id};
  } finally {
    supabase.rpc=originalRpc;
    supabase.auth.getUser=originalGetUser;
    useCoachingStore.getState().clear();
    setSessionOwner(owner);
  }
 },mutation);
 assert.deepEqual(isolation,{secondError:'operation_pending',oldError:'session_changed',role:'coach',coach:'coach-B'});
 console.log('PASS: real store ignores old account '+mutation+' and rejects concurrent local submission');
 }

 // Merely opening a link (or signing back in) must not accept the invitation.
 const explicitToken='explicit-invite-'+crypto.randomUUID();
 check(await coach.client.from('coach_invites').insert({coach_id:coach.id,token:explicitToken,max_uses:1,expires_at:new Date(Date.now()+3600000).toISOString()}));
 let accepts=0;
 clientPage.on('request',request=>{if(request.url().endsWith('/rest/v1/rpc/accept_coach_invite'))accepts++;});
 await clientPage.route('**/rest/v1/rpc/get_coach_invite_preview',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'injected preview outage'})}));
 await clientPage.goto(origin+'/invite/'+explicitToken);
 await clientPage.getByText('Unable to check this invitation. Check your connection and try again.',{exact:true}).waitFor();
 assert.equal(accepts,0);
 await clientPage.unroute('**/rest/v1/rpc/get_coach_invite_preview');
 await clientPage.getByRole('button',{name:'Retry',exact:true}).click();
 await clientPage.getByRole('button',{name:'Accept invite',exact:true}).waitFor();
 await clientPage.getByText('By accepting, you allow this coach to view your profile and tracking history during your coaching relationship. You keep your data if you end the relationship.',{exact:true}).waitFor();
 assert.equal(accepts,0);
 await clientPage.getByRole('button',{name:'Cancel',exact:true}).click();
 await clientPage.waitForURL('**/dashboard');
 await clientPage.reload();
 await clientPage.getByText('Your coaching relationship has ended',{exact:true}).waitFor();
 assert.equal(accepts,0);
 assert.equal(check(await admin.from('coach_client_links').select('status').eq('client_id',athlete.id).single()).status,'ended');
 await clientPage.goto(origin+'/invite/'+explicitToken);
 await clientPage.getByRole('button',{name:'Accept invite',exact:true}).click();
 await clientPage.waitForURL('**/dashboard');
 assert.equal(accepts,1);
 assert.equal(check(await admin.from('coach_invites').select('use_count').eq('token',explicitToken).single()).use_count,1);
 assert.equal(check(await admin.from('coach_client_links').select('status').eq('client_id',athlete.id).single()).status,'active');
 console.log('PASS: invite preview failure/retry, explicit sharing notice, cancel/reload without acceptance, and one confirmed join');

 // A new member can discover coaches without a blocking personal questionnaire.
 const prospect=await actor('Market Prospect','none');
 const prospectPage=await pageFor(prospect);
 await page.goto(origin+'/coach/profile');
 await page.getByLabel('Public name',{exact:true}).fill('Coach Marketplace Test');
 await page.getByLabel('Introduction and experience',{exact:true}).fill('Experience supporting regular physical activity.');
 await page.getByLabel('Coaching method and contact frequency',{exact:true}).fill('Weekly discussion and collaborative planning.');
 await page.getByLabel('Coaching services and terms',{exact:true}).fill('Discuss services before starting.');
 await page.getByLabel('Strength',{exact:true}).check();
 await page.getByLabel('English',{exact:true}).check();
 await page.getByLabel('Online',{exact:true}).check();
 await page.getByLabel('Publish my profile',{exact:true}).check();
 await page.getByLabel('Accept new requests',{exact:true}).check();
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Profile saved',{exact:true}).waitFor();
 await prospectPage.goto(origin+'/coaches?language=en&format=online');
 await prospectPage.getByRole('heading',{name:'Coach Marketplace Test',exact:true}).waitFor();
 await prospectPage.reload();
 assert.equal(await prospectPage.getByLabel('Language',{exact:true}).inputValue(),'en');
 await prospectPage.getByRole('link',{name:'View coach profile',exact:true}).click();
 await prospectPage.getByLabel('Name to share with the coach',{exact:true}).fill('Prospect shared name');
 await prospectPage.getByLabel('What you want from this coaching relationship',{exact:true}).fill('I would like help building a consistent routine.');
 assert.equal(await prospectPage.getByRole('button',{name:'Send my request',exact:true}).isDisabled(),true);
 await prospectPage.getByRole('checkbox').check();
 await prospectPage.getByRole('button',{name:'Send my request',exact:true}).click();
 await prospectPage.getByText('Request sent. You can follow its status in Coaching requests.',{exact:true}).waitFor();
 await page.goto(origin+'/coaching-requests');
 await page.getByRole('heading',{name:'Prospect shared name',exact:true}).waitFor();
 await page.getByRole('button',{name:'Accept request',exact:true}).click();
 await page.getByText('Request accepted',{exact:true}).waitFor();
 assert.equal(check(await admin.from('coach_client_links').select('id').eq('client_id',prospect.id)).length,0);
 assert.equal(check(await coach.client.from('user_profiles').select('id').eq('id',prospect.id)).length,0);
 await prospectPage.goto(origin+'/coaching-requests');
 await prospectPage.getByText('Request accepted',{exact:true}).waitFor();
 await prospectPage.getByRole('button',{name:'Withdraw my request',exact:true}).click();
 await prospectPage.getByText('Request withdrawn',{exact:true}).waitFor();
 await page.goto(origin+'/coach/profile');
 await page.getByLabel('Publish my profile',{exact:true}).uncheck();
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Profile saved',{exact:true}).waitFor();
 await prospectPage.goto(origin+'/coaches');
 await prospectPage.getByText('No available coach matches these criteria. Try broadening your filters.',{exact:true}).waitFor();
 await prospectPage.screenshot({path:'artifacts/questionnaire/marketplace-empty.png',fullPage:true});
 console.log('PASS: marketplace publish, retained filters, explicit minimal sharing, acceptance without dossier access, withdrawal and unpublish');
 const firstProfile=check(await coach.client.from('coach_profiles').select('*').eq('coach_id',coach.id).single());
 check(await coach.client.rpc('save_my_coach_profile',{p_profile:{...firstProfile,published:true},p_expected_updated_at:firstProfile.updated_at}));
 check(await other.client.rpc('save_my_coach_profile',{p_profile:{public_name:'Other Marketplace Coach',introduction:'Another approach.',method:'Monthly discussions.',offer:'Service details available before starting.',disciplines:['strength'],languages:['en'],formats:['online'],published:true,accepting_clients:true}}));
 await prospectPage.goto(origin+'/coaches');
 await prospectPage.getByLabel('Compare Coach Marketplace Test',{exact:true}).check();
 await prospectPage.getByLabel('Compare Other Marketplace Coach',{exact:true}).check();
 await prospectPage.getByRole('link',{name:'Compare coaches',exact:true}).click();
 await prospectPage.getByRole('columnheader',{name:'Coach Marketplace Test',exact:true}).waitFor();
 await prospectPage.getByRole('columnheader',{name:'Other Marketplace Coach',exact:true}).waitFor();
 await prospectPage.getByRole('cell',{name:'Monthly discussions.',exact:true}).waitFor();
 await prospectPage.reload();
 await prospectPage.getByRole('columnheader',{name:'Other Marketplace Coach',exact:true}).waitFor();
 await prospectPage.screenshot({path:'artifacts/questionnaire/marketplace-comparison.png',fullPage:true});
 const secondProfile=check(await other.client.from('coach_profiles').select('*').eq('coach_id',other.id).single());
 check(await other.client.rpc('save_my_coach_profile',{p_profile:{...secondProfile,published:false},p_expected_updated_at:secondProfile.updated_at}));
 await prospectPage.reload();
 await prospectPage.getByText('A selected profile is no longer published. You can still view the others.',{exact:true}).waitFor();
 assert.equal(await prospectPage.getByRole('columnheader',{name:'Other Marketplace Coach',exact:true}).count(),0);
 console.log('PASS: comparison survives reload, shows declared methods and removes unpublished profiles');
 const newcomer=await actor('Intention Newcomer','none');
 const loginContext=await browser.newContext({locale:'en-US'});
 await loginContext.addInitScript(()=>localStorage.setItem('i18nextLng','en'));
 const loginPage=await loginContext.newPage();pages.push(loginPage);loginPage.setDefaultTimeout(25000);
 let roleGrantsOnLogin=0;
 loginPage.on('request',request=>{if(request.url().endsWith('/rest/v1/rpc/set_coaching_role'))roleGrantsOnLogin++;});
 await loginPage.goto(origin+'/dashboard');
 await loginPage.locator('input[name="email"]').fill(newcomer.email);
 await loginPage.locator('input[name="password"]').fill(newcomer.password);
 await loginPage.locator('input[name="password"]').press('Enter');
 await loginPage.getByRole('heading',{name:'What brings you to Prometheus?',exact:true}).waitFor();
 assert.equal(roleGrantsOnLogin,0);
 await loginPage.getByRole('button',{name:/Find a coach/}).click();
 await loginPage.waitForURL('**/coaches');
 await loginPage.getByRole('heading',{name:'Find a coach',exact:true}).waitFor();
 const entry=check(await admin.from('user_profiles').select('entry_intent,onboarding_completed').eq('id',newcomer.id).single());
 assert.equal(entry.entry_intent,'find_coach'); assert.equal(entry.onboarding_completed,true);
 assert.equal(check(await admin.from('user_roles').select('coaching_role').eq('user_id',newcomer.id).single()).coaching_role,'none');
 assert.equal(check(await admin.from('coach_client_links').select('id').eq('client_id',newcomer.id)).length,0);
 await loginPage.reload();
 await loginPage.getByRole('heading',{name:'Find a coach',exact:true}).waitFor();
 console.log('PASS: direct identity login, intention after login, persisted coach search without a role or link grant');



} catch(error) {
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:'artifacts/questionnaire/failure-'+i+'.png',fullPage:true}).catch(()=>{});
 throw error;
} finally {
 await browser.close();
 vite.kill('SIGTERM');
}
