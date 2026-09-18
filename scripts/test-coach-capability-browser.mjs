import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
const config=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const url=config.API_URL;
assert.equal(new URL(url).hostname,'127.0.0.1');
const check=({data,error})=>{if(error)throw error;return data;};
const admin=createClient(url,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const actors=[];
async function actor(name,capability){
 const password='Local-P11-'+crypto.randomUUID();
 const {user}=check(await admin.auth.admin.createUser({email:name+'@example.test',password,email_confirm:true}));
 actors.push(user.id);
 check(await admin.from('user_profiles').update({full_name:name,language:'en',onboarding_completed:true,kinesiology_intake_completed_at:new Date().toISOString(),entry_intent:'solo'}).eq('id',user.id));
 const client=createClient(url,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {session}=check(await client.auth.signInWithPassword({email:name+'@example.test',password}));
 if(capability)check(await client.rpc('set_coach_capability',{p_enabled:true}));
 return {id:user.id,client,session};
}
const solo=await actor('p11-solo',false);
const coach=await actor('p11-coach',true);
const coached=await actor('p11-coached',false);
const dual=await actor('p11-dual',true);
const client=await actor('p11-roster',false);
check(await admin.from('coach_client_links').insert([
 {coach_id:coach.id,client_id:coached.id,status:'active'},
 {coach_id:coach.id,client_id:dual.id,status:'active'},
 {coach_id:dual.id,client_id:client.id,status:'active'},
]));
const vite=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4174'],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:config.ANON_KEY},stdio:'ignore'});
const origin='http://127.0.0.1:4174';
const browser=await chromium.launch();
await mkdir('artifacts/p11',{recursive:true});
const pages=[];
try{
 for(let i=0;i<60;i++){if(await fetch(origin).then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,500));}
 for(const [label,a,capability,hasCoach] of [['solo',solo,false,false],['coached',coached,false,true],['coach-solo',coach,true,false],['coach-coached',dual,true,true]]){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({session,key})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('i18nextLng','en');},{session:a.session,key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token'});
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(25000);
  await page.goto(origin+'/profile');
  await page.getByRole('button',{name:'Sign Out',exact:true}).waitFor();
  const ctx=check(await a.client.rpc('get_my_account_context'));
  assert.equal(ctx.coach_capability,capability);assert.equal(!!ctx.active_coach_id,hasCoach);
  const group=page.getByRole('group',{name:'Workspace'}).filter({visible:true});
  if(capability){
   await group.getByRole('button',{name:'Personal',exact:true}).click();
   await page.goto(origin+'/profile');
   await group.getByRole('button',{name:'Personal',exact:true,pressed:true}).waitFor();
   await page.screenshot({path:`artifacts/p11/${label}-personal.png`,fullPage:true});
   await group.getByRole('button',{name:'Coaching',exact:true}).click();
   await page.goto(origin+'/profile');
   await group.getByRole('button',{name:'Coaching',exact:true,pressed:true}).waitFor();
   await page.goto(origin+'/clients');
   if(a===dual)await page.getByText('p11-roster',{exact:true}).first().waitFor();
   await page.screenshot({path:`artifacts/p11/${label}-coaching.png`,fullPage:true});
  }else{
   assert.equal(await page.getByRole('group',{name:'Workspace'}).count(),0);
   if(a===coached){
    await page.getByRole('button',{name:'Off',exact:true}).click();
    await group.getByRole('button',{name:'Personal',exact:true}).waitFor();
    const enabled=check(await a.client.rpc('get_my_account_context'));
    assert.equal(enabled.coach_capability,true);assert.equal(enabled.active_coach_id,coach.id);
   }
   await page.screenshot({path:`artifacts/p11/${label}.png`,fullPage:true});
  }
  assert.equal(check(await a.client.rpc('get_my_account_context')).active_coach_id,ctx.active_coach_id);
  await context.close();
 }
 const ended=check(await dual.client.rpc('client_end_coach_link'));assert.equal(ended.ok,true);
 const after=check(await dual.client.rpc('get_my_account_context'));assert.equal(after.coach_capability,true);assert.equal(after.active_coach_id,null);
 assert.equal(check(await dual.client.from('coach_client_links').select('client_id').eq('coach_id',dual.id).eq('status','active')).length,1);
 await writeFile('artifacts/p11/results.txt','PASS: four account combinations, mobile workspace switching, coached capability activation, roster and personal departure.\n');
}catch(error){
 for(const [i,page] of pages.entries())if(!page.isClosed())await page.screenshot({path:`artifacts/p11/failure-${i}.png`,fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await browser.close();vite.kill();
 for(const id of actors)await admin.auth.admin.deleteUser(id);
}
