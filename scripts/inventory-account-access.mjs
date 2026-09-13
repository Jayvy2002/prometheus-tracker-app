// Reproducible M0 input: source call sites and effective database permissions, no user data.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const connection = process.env.DATABASE_URL;
assert.ok(connection, 'DATABASE_URL required');
assert.ok(['127.0.0.1','localhost'].includes(new URL(connection).hostname), 'Only an isolated local database is allowed');
const tokens = /\b(coachingRole|coaching_role|isCoachedAthlete|isSoloAthlete|is_coach_of|user_capabilities|coach_client_links|defaultWorkspace|personalToolsAvailable)\b/g;
const source = [];
function walk(dir) {
 for (const entry of readdirSync(dir,{withFileTypes:true})) {
  const path=join(dir,entry.name);
  if(entry.isDirectory()) walk(path);
  else if(/\.(ts|tsx)$/.test(path)&&!path.endsWith('.test.ts')) {
   const sites=readFileSync(path,'utf8').split('\n').flatMap((line,index)=>{
    const found=[...new Set(line.match(tokens)??[])];
    return found.length?[{line:index+1,tokens:found}]:[];
   });
   if(sites.length)source.push({path,sites});
  }
 }
}
walk('src'); walk('supabase/functions');
const sql=`select jsonb_build_object(
 'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname),'[]'::jsonb) from pg_policies p where p.schemaname='public'),
 'functions', (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'settings',p.proconfig,'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),'anon_execute',has_function_privilege('anon',p.oid,'execute')) order by p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ~ 'coaching_role|user_capabilities|is_coach_of|coach_client_links')
);`;
const database=JSON.parse(execFileSync('psql',[connection,'-X','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',maxBuffer:10*1024*1024}));
mkdirSync('artifacts/account-access',{recursive:true});
writeFileSync('artifacts/account-access/inventory.json',JSON.stringify({note:'Lexical inventory and effective SQL permissions. Semantic review and browser scenarios are still required.',source,database},null,2));
console.log(`Account access inventory: ${source.length} source files, ${database.policies.length} policies, ${database.functions.length} role-sensitive functions`);
