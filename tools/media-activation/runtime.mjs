import assert from 'node:assert/strict';
import {assertMediaProposal,mediaColumns} from './proposal.mjs';
import {readSchemaCatalog,assertSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertLedger,policy} from '../phase6a-local/policy.mjs';
import {assertStudyPolicies,assertStudyPrivileges} from '../study-activation/proposed-runtime-guard.mjs';
import {assertLessonRevisionGuard} from '../lesson-activation/policy.mjs';
// Compare boolean structure, not a parentheses-stripped string. BETWEEN and its
// PostgreSQL deparse are equivalent; AND/OR nesting must retain its meaning.
export function checkTree(expression) {
  const expanded=expression.replace(/\b(width|height) BETWEEN 1 AND 8192/gi,'(($1 >= 1) AND ($1 <= 8192))');
  const tokens=expanded.match(/'(?:''|[^'])*'|"[^"]+"|::|<=|>=|<>|[a-z_][a-z_0-9]*|[0-9]+|[^\s]/gi).map(t=>t.startsWith("'")?t:t.toLowerCase().replace(/^"|"$/g,''));
  for(let i=tokens.length-2;i>=0;i--)if(tokens[i]==='::'&&tokens[i+1]==='text')tokens.splice(i,2);
  function parse(input) {
    let t=input;
    while(t[0]==='('&&t.at(-1)===')'){
      let depth=0,whole=true;for(let i=0;i<t.length-1;i++){if(t[i]==='(')depth++;if(t[i]===')')depth--;if(depth===0){whole=false;break;}}
      if(!whole)break;t=t.slice(1,-1);
    }
    for(const op of ['or','and']){
      let depth=0,start=0;const groups=[];
      for(let i=0;i<t.length;i++){if(t[i]==='(')depth++;if(t[i]===')')depth--;if(depth===0&&t[i]===op){groups.push(t.slice(start,i));start=i+1;}}
      if(groups.length){groups.push(t.slice(start));const parts=groups.map(parse).flatMap(p=>Array.isArray(p)&&p[0]===op?p.slice(1):[p]);return[op,...parts];}
    }
    return t.join(' ');
  }
  return parse(tokens);
}
export async function assertMediaDetails(client,snapshot) {
  const defaults=(await client.query("SELECT a.attname AS name,pg_get_expr(d.adbin,d.adrelid) AS value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.lesson_media'::regclass AND a.attname=ANY($1::text[]) ORDER BY a.attname",[mediaColumns])).rows;
  assert.deepEqual(defaults.map(r=>({name:r.name,value:r.value===null?null:checkTree(r.value)})),mediaColumns.map(name=>({name,value:snapshot.tables['public.lesson_media'].columns[name].default??null})).map(r=>({...r,value:r.value===null?null:checkTree(r.value)})).sort((a,b)=>a.name.localeCompare(b.name)));
  const constraint=(await client.query("SELECT pg_get_expr(conbin,conrelid) AS expression,convalidated FROM pg_constraint WHERE conrelid='public.lesson_media'::regclass AND conname='lesson_media_library_metadata_ck'")).rows;
  assert.equal(constraint.length,1);assert.equal(constraint[0].convalidated,true);
  assert.deepEqual(checkTree(constraint[0].expression),checkTree(snapshot.tables['public.lesson_media'].checkConstraints.lesson_media_library_metadata_ck.value),'Metadata constraint expression changed');
  const index=(await client.query("SELECT pg_get_indexdef(indexrelid) AS definition,indisvalid,indisready FROM pg_index WHERE indexrelid=to_regclass('public.lesson_media_library_created_idx')")).rows;
  assert.deepEqual(index,[{definition:'CREATE INDEX lesson_media_library_created_idx ON public.lesson_media USING btree (created_at DESC, id)',indisvalid:true,indisready:true}],'Media index ordering or validity changed');
}
export async function assertMediaRuntimeCatalog(client,root,manifest,owner=policy.migrationRole) {
  const {snapshot}=assertMediaProposal(root),actual=await readSchemaCatalog(client);
  assert([15,16].includes(manifest.length));assertMediaCatalogStructure(actual,snapshot,owner);
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(ledger,manifest);assert.deepEqual(ledger.map(r=>r.id),Array.from({length:manifest.length},(_,i)=>i+1));
  await assertMediaDetails(client,snapshot);await assertStudyPolicies(client);await assertStudyPrivileges(client,policy.appRole);await assertLessonRevisionGuard(client,root,owner);
  return {ledgerEntries:manifest.length,tables:22,rlsPolicies:2,ownershipMatched:true};
}
export function assertMediaCatalogStructure(actual,snapshot,owner=policy.migrationRole) {
  assert.equal(actual.tables.length,22);assert(actual.tables.every(t=>t.owner===owner));
  assertSchemaCatalog({...actual,tables:actual.tables.map(t=>({...t,owner:policy.migrationRole}))},snapshot);
}
