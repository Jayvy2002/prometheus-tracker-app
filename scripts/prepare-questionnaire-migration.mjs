import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const before=new Set(readdirSync(dir));
execFileSync('supabase',['migration','new','coach_questionnaires'],{stdio:'inherit'});
const added=readdirSync(dir).filter(name=>!before.has(name));
assert.equal(added.length,1,'Expected exactly one CLI-generated migration');
const name=added[0];
assert.match(name,/^\d{14}_coach_questionnaires\.sql$/);
writeFileSync(dir+'/'+name,readFileSync('supabase/changes/coach_questionnaires.sql'));
mkdirSync('artifacts/questionnaire-release',{recursive:true});
copyFileSync(dir+'/'+name,'artifacts/questionnaire-release/'+name);
writeFileSync('artifacts/questionnaire-release/manifest.json',JSON.stringify({
 version:name.slice(0,14),file:name,source_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 applied:false
},null,2)+'\n');
console.log('Prepared only; no database changes: '+name);
