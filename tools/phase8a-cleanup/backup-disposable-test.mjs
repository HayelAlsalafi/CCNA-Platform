import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// Called only by the identity-guarded isolated test suite, never the application.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync,copyFileSync,realpathSync } from 'node:fs';
import { execFileSync,spawnSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import path from 'node:path';
import { decodeArchiveTables, orderedRestoreSql, reviewedInventory, reviewedProvenanceAmendments, finalPlan, verifyDisposableOwnership } from './final-planner.mjs';
export function testBackupRestore(){
  assert.equal(process.env.RUN_ADMIN_PRACTICE_DISPOSABLE_TESTS,'1');
  const root=realpathSync(process.cwd());assert.equal(root.replaceAll('\\','/').toLowerCase(),portableRoot.toLowerCase());
  const original=path.join(root,'.local/phase8a-cleanup/2026-10-13T15-59-16-134Z/before-cleanup.dump');
  const sha256=createHash('sha256').update(readFileSync(original)).digest('hex');assert.equal(sha256,'de76195778fbe3a57d940892ee71f1904ec3d94aa6c8fd8d773657d438ce1d13');
  const folder=path.join(root,'.local/final-legacy-cleanup','restore-test-'+randomUUID());mkdirSync(folder,{recursive:true});
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(SYSTEMROOT|WINDIR|COMSPEC|PATH|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)$/i.test(k)));
  const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{env,encoding:'utf8'}).match(/S-1-[0-9-]+/)?.[0];assert(sid);
  execFileSync('icacls.exe',[folder,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{env,stdio:'pipe'});
  const archive=path.join(folder,'before-cleanup.dump');copyFileSync(original,archive);
  const bin='C:/Program Files/PostgreSQL/18/bin', tables=['users','topics','questions','question_options','question_revisions','practice_deliveries','practice_attempts','exam_blueprints','exam_domains','exam_objectives','question_objectives'];
  const restored=orderedRestoreSql(execFileSync(path.join(bin,'pg_restore.exe'),['--data-only','--no-owner','--no-privileges','--schema=public',...tables.flatMap(t=>['--table',t]),'--file=-',archive],{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024}),tables);
  const expected=decodeArchiveTables(restored);
  assert.equal(expected.questions.length,135);assert.equal(expected.topics.length,102);
  const fingerprint=tables.map(t=>`'${t}',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.${t} t)`).join(',');
  const empty=tables.map(t=>`IF EXISTS(SELECT 1 FROM public.${t}) THEN RAISE EXCEPTION 'Test database not empty'; END IF;`).join('\n');
  const inventory=reviewedInventory(),legacy=inventory.questions.map(q=>q.id),obsolete=inventory.topics.map(t=>t.id);
  const array=ids=>{assert(ids.every(id=>/^[a-f0-9-]{36}$/.test(id)));return "ARRAY["+ids.map(id=>"'"+id+"'").join(',')+"]::uuid[]";};
  const owned=array(legacy),unused=array(obsolete);
  const approvedMetadata=reviewedProvenanceAmendments().map(e=>{
    assert(['questions','topics'].includes(e.table)&&/^[a-f0-9-]{36}$/.test(e.id)&&/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(e.actual));
    return `UPDATE public.${e.table} SET updated_at='${e.actual}'::timestamptz WHERE id='${e.id}'::uuid;`;
  }).join('\n');
  const protectedHash=tables.map(t=>{
    const where=t==='questions'?`WHERE NOT id=ANY(${owned})`:t==='topics'?`WHERE NOT id=ANY(${unused})`:['question_options','question_revisions','practice_deliveries','practice_attempts','question_objectives'].includes(t)?`WHERE NOT question_id=ANY(${owned})`:'';
    return `'${t}',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.${t} t ${where})`;
  }).join(',');
  const data=tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.${t} t)`).join(',');
  const cleanup=`DO $cleanup$ DECLARE before jsonb; after jsonb; q uuid; c jsonb; revisions bigint:=0; deliveries bigint:=0; attempts bigint:=0; affected integer; BEGIN
    SELECT jsonb_build_object(${protectedHash}) INTO before;
    FOREACH q IN ARRAY ${owned} LOOP SELECT public.delete_question_with_history(q,NULL) INTO c; revisions:=revisions+(c->>'revisions')::bigint;deliveries:=deliveries+(c->>'deliveries')::bigint;attempts:=attempts+(c->>'attempts')::bigint; END LOOP;
    DELETE FROM public.topics WHERE id=ANY(${unused});GET DIAGNOSTICS affected=ROW_COUNT;
    SELECT jsonb_build_object(${protectedHash}) INTO after;
    IF affected<>78 OR (SELECT count(*) FROM public.questions)<>60 OR (SELECT count(*) FROM public.topics)<>24 OR (SELECT count(*) FROM public.exam_domains)<>6 OR before<>after OR revisions<>163 OR deliveries<>99 OR attempts<>53 THEN RAISE EXCEPTION 'Full exact cleanup invariant failed'; END IF;
    END $cleanup$; SELECT jsonb_build_object('questions',60,'topics',24,'revisionsDeleted',163,'deliveriesDeleted',99,'attemptsDeleted',53,'protectedDataUnchanged',true)::text;`;
  const query=`BEGIN; SET LOCAL TimeZone='UTC'; DO $g$ BEGIN IF current_database()<>'ccna_drizzle_check_20261012_c08f12ad34b6' OR session_user<>'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 THEN RAISE EXCEPTION 'Wrong target'; END IF; ${empty} END $g$; ALTER TABLE public.practice_attempts DISABLE TRIGGER practice_attempts_validate_revision; ${restored} ALTER TABLE public.practice_attempts ENABLE TRIGGER practice_attempts_validate_revision; SELECT jsonb_build_object(${fingerprint})::text; UPDATE public.questions SET status='DISABLED' WHERE id=ANY(${owned}); UPDATE public.topics SET status='DISABLED' WHERE id=ANY(${unused}); ${approvedMetadata} SELECT jsonb_build_object(${data})::text; ${cleanup} ROLLBACK;`;
  const result=spawnSync(path.join(bin,'psql.exe'),['--host=127.0.0.1','--port=55440','--username=ccna_taxonomy_rehearsal_owner_8e6c4b9a2170','--dbname=ccna_drizzle_check_20261012_c08f12ad34b6','--no-password','--no-psqlrc','--set=ON_ERROR_STOP=1','--set=VERBOSITY=verbose','--quiet','--tuples-only','--no-align','--file=-'],{env,input:query,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:1024*1024});
  if(result.status!==0){const table=result.stderr.match(/COPY ([a-z_]+),/)?.[1];const fn=result.stderr.match(/PL\/pgSQL function ([a-z_]+)/)?.[1];const error=Error('Restore fixture failed; SQLSTATE '+(result.stderr.match(/ERROR:\s+([0-9A-Z]{5})/)?.[1]??'withheld')+'; table '+(tables.includes(table)?table:'none')+'; validation '+(['validate_question_snapshot','validate_revision_attempt','validate_revision_delivery'].includes(fn)?fn:'other')+'. Raw SQL/data/errors withheld');throw error;}
  const jsonLines=result.stdout.split(/\r?\n/).filter(l=>l.startsWith('{'));assert.equal(jsonLines.length,3);const proof={sha256,tables:JSON.parse(jsonLines[0])};
  const current=JSON.parse(jsonLines[1]),preserved=current.questions.filter(q=>!legacy.includes(q.id)).map(q=>({id:q.id,topicId:q.topic_id,questionCode:q.question_code,status:q.status}));
  const questions=current.questions.map(q=>({...q,topicId:q.topic_id,questionCode:q.question_code}));
  const plan=finalPlan(preserved,questions,current.topics,inventory);
  assert.deepEqual(verifyDisposableOwnership(plan,current,expected,inventory),{question_revisions:163,practice_deliveries:99,practice_attempts:53});
  assert.deepEqual(JSON.parse(jsonLines[2]),{questions:60,topics:24,revisionsDeleted:163,deliveriesDeleted:99,attemptsDeleted:53,protectedDataUnchanged:true});
  for(const table of tables)assert.equal(proof.tables[table].count,expected[table].length);
  const proofPath=path.join(folder,'restore-proof-input.json');writeFileSync(proofPath,JSON.stringify(proof));
  const check=execFileSync(process.execPath,[path.join(root,'tools/phase8a-cleanup/verify-backup.mjs'),'--verify-rollback-restoration',archive,proofPath],{env,encoding:'utf8',windowsHide:true,timeout:150000});
  assert.equal(JSON.parse(check).restoreVerified,true);
  return {archive,proofPath,rows:135,topics:102,rollback:true,fullCleanup:{questions:60,topics:24,revisionsDeleted:163,deliveriesDeleted:99,attemptsDeleted:53}};
}
